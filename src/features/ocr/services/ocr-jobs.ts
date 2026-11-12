import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AllowedMimeType } from "@/contracts";
import { getOcrProvider } from "@/lib/providers";
import type { OcrProvider } from "@/lib/providers/ocr-provider";
import { createAdminClient } from "@/lib/supabase/admin";
import { transitionDocument } from "@/features/processing/services/lifecycle";
import {
  type ClaimedJob,
  type JobHandler,
  type JobOutcome,
  registerJobHandler,
} from "@/features/processing/services/job-registry";
import { persistPages } from "@/features/ocr/services/persist-pages";

const STORAGE_BUCKET = "documents";
const MAX_POLLS = 40;
const POLL_BASE_MS = 3_000;
const POLL_CAP_MS = 60_000;

/** Injectable dependencies so the handlers can run against fakes in tests. */
export type OcrJobDeps = {
  admin: SupabaseClient;
  provider: OcrProvider;
  downloadBytes: (
    admin: SupabaseClient,
    documentId: string,
  ) => Promise<{
    bytes: Uint8Array;
    mimeType: AllowedMimeType;
    filename: string;
  }>;
  setOcrDocumentId: (
    admin: SupabaseClient,
    documentId: string,
    providerDocumentId: string,
  ) => Promise<void>;
  transition: typeof transitionDocument;
  persistPages: typeof persistPages;
};

/** The OCR provider id travels in the payload; later steps read it from here. */
function providerIdFromPayload(job: ClaimedJob): string {
  const payload = job.payload;
  const id =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? payload.providerDocumentId
      : undefined;
  if (typeof id !== "string" || id.length === 0) {
    throw new Error("missing providerDocumentId in job payload");
  }
  return id;
}

/**
 * OCR_SUBMIT: download the file, submit it to OCR, store the returned provider
 * id on the document, and start OCR. SECURITY: the provider id is carried
 * forward in the OCR_POLL payload; later steps read it from the payload, never
 * from documents.ocr_document_id, so a tampered row cannot redirect the job.
 */
export function makeOcrSubmitHandler(deps: OcrJobDeps): JobHandler {
  return async (job): Promise<JobOutcome> => {
    const { bytes, mimeType, filename } = await deps.downloadBytes(
      deps.admin,
      job.documentId,
    );
    const { providerDocumentId } = await deps.provider.submit({
      bytes,
      mimeType,
      filename,
    });

    await deps.setOcrDocumentId(deps.admin, job.documentId, providerDocumentId);
    await deps.transition(
      deps.admin,
      job.documentId,
      "UPLOADED",
      "OCR_PROCESSING",
    );

    return {
      kind: "done",
      next: [
        {
          documentId: job.documentId,
          userId: job.userId,
          type: "OCR_POLL",
          idempotencyKey: `ocr-poll:${job.documentId}`,
          payload: { providerDocumentId },
        },
      ],
    };
  };
}

/**
 * OCR_POLL: ask OCR for status. PENDING/PROCESSING retries with backoff
 * (3s, 6s, 12s, ... capped at 60s), timing out after 40 polls. READY/PARTIAL
 * hands off to OCR_FETCH. FAILED marks the document OCR_FAILED.
 *
 * shortcut: the poll number and backoff come from job.attempts, and the
 * current job-runner (Task B2) computes its own retry delay and caps at
 * max_attempts, so afterMs and the 40-poll timeout only hold end-to-end once
 * the runner honors afterMs and the poll job uses a high max_attempts.
 */
export function makeOcrPollHandler(deps: OcrJobDeps): JobHandler {
  return async (job): Promise<JobOutcome> => {
    const providerDocumentId = providerIdFromPayload(job);
    const { status } = await deps.provider.getStatus(providerDocumentId);

    if (status === "READY" || status === "PARTIAL") {
      return {
        kind: "done",
        next: [
          {
            documentId: job.documentId,
            userId: job.userId,
            type: "OCR_FETCH",
            idempotencyKey: `ocr-fetch:${job.documentId}`,
            payload: { providerDocumentId },
          },
        ],
      };
    }

    if (status === "FAILED") {
      await deps.transition(
        deps.admin,
        job.documentId,
        "OCR_PROCESSING",
        "OCR_FAILED",
      );
      return { kind: "fail", errorCode: "OCR_FAILED" };
    }

    // PENDING or PROCESSING: back off, or time out after MAX_POLLS.
    if (job.attempts > MAX_POLLS) {
      return { kind: "fail", errorCode: "OCR_TIMEOUT" };
    }
    const afterMs = Math.min(
      POLL_BASE_MS * Math.pow(2, job.attempts - 1),
      POLL_CAP_MS,
    );
    return { kind: "retry", afterMs, reason: "OCR still processing" };
  };
}

/**
 * OCR_FETCH: pull the pages once, upsert them, mark the document OCR_READY (or
 * OCR_PARTIAL if any page failed), and start analysis.
 */
export function makeOcrFetchHandler(deps: OcrJobDeps): JobHandler {
  return async (job): Promise<JobOutcome> => {
    const providerDocumentId = providerIdFromPayload(job);
    const pages = await deps.provider.getPages(providerDocumentId);

    await deps.persistPages(deps.admin, job.documentId, job.userId, pages);

    const anyFailed = pages.some((p) => p.status === "FAILED");
    await deps.transition(
      deps.admin,
      job.documentId,
      "OCR_PROCESSING",
      anyFailed ? "OCR_PARTIAL" : "OCR_READY",
    );

    return {
      kind: "done",
      next: [
        {
          documentId: job.documentId,
          userId: job.userId,
          type: "ANALYZE",
          idempotencyKey: `analyze:${job.documentId}:1`,
        },
      ],
    };
  };
}

/** Download the full file bytes plus the mime type and filename to submit. */
async function downloadBytes(
  admin: SupabaseClient,
  documentId: string,
): Promise<{ bytes: Uint8Array; mimeType: AllowedMimeType; filename: string }> {
  const { data: document, error } = await admin
    .from("documents")
    .select("storage_path, mime_type, original_filename")
    .eq("id", documentId)
    .single();
  if (error || !document) throw new Error("document not found for OCR submit");

  const { data: blob, error: downloadError } = await admin.storage
    .from(STORAGE_BUCKET)
    .download(document.storage_path);
  if (downloadError || !blob) throw new Error("could not download file for OCR");

  return {
    bytes: new Uint8Array(await blob.arrayBuffer()),
    mimeType: document.mime_type as AllowedMimeType,
    filename: document.original_filename as string,
  };
}

/** Persist the provider document id so a human can trace the OCR job later. */
async function setOcrDocumentId(
  admin: SupabaseClient,
  documentId: string,
  providerDocumentId: string,
): Promise<void> {
  const { error } = await admin
    .from("documents")
    .update({ ocr_document_id: providerDocumentId })
    .eq("id", documentId);
  if (error) throw error;
}

/** Build the default, production-wired dependencies. */
function defaultDeps(): OcrJobDeps {
  return {
    admin: createAdminClient(),
    provider: getOcrProvider(),
    downloadBytes,
    setOcrDocumentId,
    transition: transitionDocument,
    persistPages,
  };
}

/** Register the OCR handlers with the job registry, wired to real services. */
export function registerOcrHandlers(): void {
  registerJobHandler("OCR_SUBMIT", makeOcrSubmitHandler(defaultDeps()));
  registerJobHandler("OCR_POLL", makeOcrPollHandler(defaultDeps()));
  registerJobHandler("OCR_FETCH", makeOcrFetchHandler(defaultDeps()));
}

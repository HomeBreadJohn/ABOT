import "server-only";

import { createHash } from "node:crypto";

import {
  submitCorrectionsRequestSchema,
  submitCorrectionsResponseSchema,
  type AnalysisResult,
  type EvidenceReference,
} from "@/contracts";
import { AppError } from "@/lib/http/app-error";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  enqueueJob,
  kickJobRunner,
} from "@/features/processing/services/job-runner";
import type { NormalizedPage } from "@/lib/providers/ocr-provider";
import type { z } from "zod";

/** A REQUIRED review item to resolve, with the OCR range it points at. */
export type RequiredRequirement = {
  id: string;
  findingId?: string;
  pageNumber: number;
  wordStart: number;
  wordEnd: number;
};

/** A word range already corrected in an earlier submission. */
export type CorrectedRange = {
  pageNumber: number;
  wordStart: number;
  wordEnd: number;
};

/** A row to insert; the store assigns id, status, and created_at. */
export type NewCorrection = {
  document_id: string;
  user_id: string;
  page_number: number;
  original_value: string;
  corrected_value: string | null;
  word_start: number;
  word_end: number;
};

/** A persisted correction row read back after insert. */
export type CorrectionRow = NewCorrection & {
  id: string;
  correction_status: string;
  created_at: string;
};

/** Data-access seam so unit tests run against in-memory fakes. */
export type SubmitCorrectionsDeps = {
  /** Owner of the document, or null when it does not exist. */
  loadDocumentOwner: (documentId: string) => Promise<string | null>;
  /** OCR page with its words, or null when the page has no OCR. */
  loadPage: (documentId: string, pageNumber: number) => Promise<NormalizedPage | null>;
  /** Open REQUIRED review items on the document's latest analysis. */
  loadRequiredRequirements: (documentId: string) => Promise<RequiredRequirement[]>;
  /** Ranges corrected by earlier submissions. */
  loadPriorCorrectedRanges: (documentId: string) => Promise<CorrectedRange[]>;
  insertCorrections: (rows: NewCorrection[]) => Promise<CorrectionRow[]>;
  enqueue: typeof enqueueJob;
  kick: typeof kickJobRunner;
};

/**
 * Submit OCR corrections for a document. Each item targets a word range on a
 * page; the ORIGINAL OCR words for the range are stored alongside the corrected
 * value (or null for UNREADABLE) as a NEW row. Prior corrections are never
 * mutated — a newer correction for the same range supersedes but both stay in
 * history. Only the owner may correct; anyone else gets NOT_FOUND. When every
 * REQUIRED review item is resolved by a correction, a REANALYZE job is enqueued.
 */
export async function submitCorrections(
  userId: string,
  documentId: string,
  input: z.infer<typeof submitCorrectionsRequestSchema>,
  origin: string,
  deps: SubmitCorrectionsDeps = defaultDeps(),
): Promise<z.infer<typeof submitCorrectionsResponseSchema>> {
  const owner = await deps.loadDocumentOwner(documentId);
  // Only the owner may correct; a recipient or stranger gets NOT_FOUND.
  if (owner !== userId) throw new AppError("NOT_FOUND");

  const rows: NewCorrection[] = [];
  for (const item of input.items) {
    const page = await deps.loadPage(documentId, item.pageNumber);
    if (!page) {
      throw new AppError("INVALID_REQUEST", "No OCR for the requested page.");
    }
    const maxIndex = page.words.length - 1;
    if (item.wordStart > item.wordEnd || item.wordEnd > maxIndex) {
      throw new AppError(
        "INVALID_REQUEST",
        "Correction word range is outside the page.",
      );
    }
    const originalValue = page.words
      .filter((w) => w.index >= item.wordStart && w.index <= item.wordEnd)
      .map((w) => w.text)
      .join(" ");
    rows.push({
      document_id: documentId,
      user_id: userId,
      page_number: item.pageNumber,
      original_value: originalValue,
      corrected_value: item.correctedValue ?? null,
      word_start: item.wordStart,
      word_end: item.wordEnd,
    });
  }

  const inserted = await deps.insertCorrections(rows);

  // Enqueue reanalysis only once every REQUIRED review item is covered by a
  // correction (this batch plus any from earlier submissions).
  const required = await deps.loadRequiredRequirements(documentId);
  if (required.length > 0) {
    const prior = await deps.loadPriorCorrectedRanges(documentId);
    const covered = [
      ...prior,
      ...inserted.map((r) => ({
        pageNumber: r.page_number,
        wordStart: r.word_start,
        wordEnd: r.word_end,
      })),
    ];
    const allResolved = required.every((req) =>
      covered.some((c) => rangesOverlap(c, req)),
    );
    if (allResolved) {
      const ids = inserted.map((r) => r.id).sort();
      const hash = createHash("sha256").update(ids.join(",")).digest("hex");
      await deps.enqueue({
        documentId,
        userId,
        type: "REANALYZE",
        idempotencyKey: `reanalyze:${documentId}:${hash}`,
      });
      deps.kick(origin);
    }
  }

  return submitCorrectionsResponseSchema.parse({
    corrections: inserted.map(toContract),
  });
}

/** Two ranges on the same page that share at least one word index. */
function rangesOverlap(
  a: { pageNumber: number; wordStart: number; wordEnd: number },
  b: { pageNumber: number; wordStart: number; wordEnd: number },
): boolean {
  return (
    a.pageNumber === b.pageNumber &&
    a.wordStart <= b.wordEnd &&
    b.wordStart <= a.wordEnd
  );
}

function toContract(row: CorrectionRow) {
  return {
    id: row.id,
    pageNumber: row.page_number,
    wordStart: row.word_start,
    wordEnd: row.word_end,
    originalText: row.original_value,
    correctedValue: row.corrected_value,
    createdAt: row.created_at,
  };
}

function defaultDeps(): SubmitCorrectionsDeps {
  const admin = createAdminClient();
  return {
    async loadDocumentOwner(documentId) {
      const { data } = await admin
        .from("documents")
        .select("user_id")
        .eq("id", documentId)
        .maybeSingle();
      return (data?.user_id as string | undefined) ?? null;
    },
    async loadPage(documentId, pageNumber) {
      const { data } = await admin
        .from("document_pages")
        .select("page_number, ocr_status, extracted_text, average_confidence, page_metadata")
        .eq("document_id", documentId)
        .eq("page_number", pageNumber)
        .maybeSingle();
      if (!data) return null;
      const words =
        (data.page_metadata as { words?: NormalizedPage["words"] } | null)
          ?.words ?? [];
      return {
        pageNumber: data.page_number as number,
        status: data.ocr_status as "READY" | "FAILED",
        text: data.extracted_text as string,
        words,
        averageConfidence: data.average_confidence as number | null,
      };
    },
    async loadRequiredRequirements(documentId) {
      const { data } = await admin
        .from("document_analyses")
        .select("report_json")
        .eq("document_id", documentId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      const report = data?.report_json as AnalysisResult | undefined;
      if (!report) return [];
      const evidenceById = new Map(
        report.evidence.map((e: EvidenceReference) => [e.id, e]),
      );
      return report.reviewRequirements
        .filter((r) => r.reviewStatus === "REQUIRED")
        .map((r) => {
          const evidence = r.evidenceId ? evidenceById.get(r.evidenceId) : undefined;
          return {
            id: r.id,
            findingId: r.findingId,
            pageNumber: r.pageNumber,
            wordStart: evidence?.wordStart ?? 0,
            wordEnd: evidence?.wordEnd ?? Number.MAX_SAFE_INTEGER,
          };
        });
    },
    async loadPriorCorrectedRanges(documentId) {
      const { data } = await admin
        .from("ocr_corrections")
        .select("page_number, word_start, word_end")
        .eq("document_id", documentId);
      return (data ?? []).map((r) => ({
        pageNumber: r.page_number as number,
        wordStart: r.word_start as number,
        wordEnd: r.word_end as number,
      }));
    },
    async insertCorrections(rows) {
      const { data, error } = await admin
        .from("ocr_corrections")
        .insert(rows)
        .select(
          "id, document_id, user_id, page_number, original_value, corrected_value, correction_status, word_start, word_end, created_at",
        );
      if (error) throw error;
      return (data ?? []) as CorrectionRow[];
    },
    enqueue: enqueueJob,
    kick: kickJobRunner,
  };
}

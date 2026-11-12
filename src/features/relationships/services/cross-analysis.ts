import "server-only";

import { z } from "zod";

import {
  crossAnalyzeRequestSchema,
  crossAnalyzeResponseSchema,
  crossAnalysisResponseSchema,
  crossAnalysisResultSchema,
  type DocumentCategory,
  parseAnalysisResult,
} from "@/contracts";
import { AppError } from "@/lib/http/app-error";
import type { ChatProvider } from "@/lib/providers/chat-provider";
import { getChatProvider } from "@/lib/providers";
import { requestJson } from "@/features/intelligence/services/json-reply";
import {
  buildCrossAnalysisPrompt,
  type CompactDocument,
} from "@/features/intelligence/prompts/cross-analysis";
import {
  type EnqueueInput,
  type JobHandler,
  type JobOutcome,
  registerJobHandler,
} from "@/features/processing/services/job-registry";
import { enqueueJob } from "@/features/processing/services/job-runner";
import { createAdminClient } from "@/lib/supabase/admin";

/* -------------------------------------------------------------------------- */
/* requestCrossAnalysis                                                       */
/* -------------------------------------------------------------------------- */

/** Data-access seam so unit tests run against in-memory fakes. */
export type CrossAnalysisDeps = {
  /** True when the user owns or is shared the document; false otherwise. */
  authorize: (userId: string, documentId: string) => Promise<boolean>;
  /** True when the document has a COMPLETED/SUCCEEDED analysis. */
  hasCompletedAnalysis: (documentId: string) => Promise<boolean>;
  /** Insert a RUNNING cross_document_analyses row + join rows; returns its id. */
  insertAnalysis: (input: {
    userId: string;
    documentIds: string[];
  }) => Promise<string>;
  enqueue: (input: EnqueueInput) => Promise<{ jobId: string; created: boolean }>;
};

/**
 * Start a combined analysis of 2–5 documents. Every document must be owned by
 * or shared with the user AND have a completed analysis; otherwise its
 * existence is hidden with NOT_FOUND. A RUNNING row and its join rows are
 * inserted, a CROSS_ANALYZE job is enqueued, and the id is returned.
 */
export async function requestCrossAnalysis(
  userId: string,
  documentIds: string[],
  deps: CrossAnalysisDeps = defaultRequestDeps(),
): Promise<z.infer<typeof crossAnalyzeResponseSchema>> {
  // 2..5 validation lives in the contract; surface it as INVALID_REQUEST.
  const parsed = crossAnalyzeRequestSchema.safeParse({ documentIds });
  if (!parsed.success) {
    throw new AppError("INVALID_REQUEST", "Select between 2 and 5 documents.");
  }
  const ids = parsed.data.documentIds;

  // Each document must be authorized and have a completed analysis. A failure
  // on either is NOT_FOUND (never FORBIDDEN), so existence is not revealed.
  const checks = await Promise.all(
    ids.map(async (id) => {
      const [authorized, completed] = await Promise.all([
        deps.authorize(userId, id),
        deps.hasCompletedAnalysis(id),
      ]);
      return authorized && completed;
    }),
  );
  if (checks.some((ok) => !ok)) throw new AppError("NOT_FOUND");

  const crossAnalysisId = await deps.insertAnalysis({ userId, documentIds: ids });

  await deps.enqueue({
    documentId: ids[0],
    userId,
    type: "CROSS_ANALYZE",
    idempotencyKey: `cross-analyze:${crossAnalysisId}`,
    payload: { crossAnalysisId, documentIds: ids },
  });

  return crossAnalyzeResponseSchema.parse({ crossAnalysisId, documentIds: ids });
}

/* -------------------------------------------------------------------------- */
/* CROSS_ANALYZE job handler                                                  */
/* -------------------------------------------------------------------------- */

/** One document reduced to the COMPACT findings the model is allowed to see. */
export type DocumentCompactSummary = {
  documentId: string;
  category: DocumentCategory;
  /** Titles, statuses, and page numbers — never the full OCR text. */
  findings: { title: string; informationStatus: string; pages: number[] }[];
  /** Page numbers that actually exist in this document's evidence. */
  validPages: number[];
};

export type CrossAnalyzeJobDeps = {
  loadSummaries: (documentIds: string[]) => Promise<DocumentCompactSummary[]>;
  chat: ChatProvider;
  save: (
    crossAnalysisId: string,
    status: "SUCCEEDED" | "FAILED",
    result?: unknown,
  ) => Promise<void>;
};

type CrossAnalyzePayload = { crossAnalysisId: string; documentIds: string[] };

/** The raw per-finding shape the model returns before post-processing. */
const rawFindingSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  explanation: z.string(),
  // Accept any string so an illegal CONFIRMED_MATCH is captured, not rejected,
  // and can be downgraded deterministically below.
  informationStatus: z.string(),
  sources: z.array(
    z.object({ documentId: z.string().min(1), pageNumber: z.number().int() }),
  ),
});

const rawResultSchema = z.object({
  category: crossAnalysisResultSchema.shape.category,
  overview: z.string(),
  explanation: z.string(),
  findings: z.array(rawFindingSchema),
  limitations: z.array(z.string()),
});

type CrossStatus = z.infer<
  typeof crossAnalysisResultSchema
>["findings"][number]["informationStatus"];

const ALLOWED_STATUS = new Set<string>([
  "FOUND",
  "NOT_FOUND",
  "UNCLEAR",
  "CONFLICTING",
  "INFERRED",
]);
const PAID_RE = /\b(paid|settled|cleared|nabayaran)\b/i;
const RECEIPT_RE = /\b(receipt|official receipt|\bor\b|payment received|paid)\b/i;
const VERIFY_STEP =
  " Next step: verify with the issuer, as no receipt evidence confirms payment.";

/**
 * CROSS_ANALYZE: compare the COMPACT findings of each document and store the
 * validated combined result. Post-processing enforces the safety rules the
 * model cannot be trusted to follow:
 *  - a finding must cite at least one {documentId, pageNumber} that exists in a
 *    SOURCE document; sourceless or fabricated-page findings are dropped;
 *  - CONFIRMED_MATCH (or any non-allowed status) is replaced with INFERRED;
 *  - a "bill is paid" claim is kept as stated only when a source document's
 *    findings carry a receipt/paid reference; otherwise it becomes INFERRED
 *    with a verification next step.
 */
export function makeCrossAnalyzeHandler(deps: CrossAnalyzeJobDeps): JobHandler {
  return async (job): Promise<JobOutcome> => {
    const { crossAnalysisId, documentIds } =
      job.payload as unknown as CrossAnalyzePayload;

    const summaries = await deps.loadSummaries(documentIds);

    const compact: CompactDocument[] = summaries.map((s) => ({
      documentId: s.documentId,
      category: s.category,
      findings: s.findings,
    }));

    const session = await deps.chat.openSession();
    const raw = await requestJson(
      deps.chat,
      session.sessionId,
      buildCrossAnalysisPrompt(compact),
      rawResultSchema,
    );

    const result = postProcess(raw, summaries);
    const validated = crossAnalysisResultSchema.parse(result);

    await deps.save(crossAnalysisId, "SUCCEEDED", validated);
    return { kind: "done" };
  };
}

/** Pages that exist per document, and whether a doc shows receipt/paid evidence. */
function postProcess(
  raw: z.infer<typeof rawResultSchema>,
  summaries: DocumentCompactSummary[],
): z.infer<typeof crossAnalysisResultSchema> {
  const validPages = new Map(summaries.map((s) => [s.documentId, new Set(s.validPages)]));
  const hasReceipt = (documentId: string): boolean => {
    const doc = summaries.find((s) => s.documentId === documentId);
    return Boolean(doc?.findings.some((f) => RECEIPT_RE.test(f.title)));
  };

  const findings = raw.findings
    .map((f) => {
      // Keep only sources that point at a real page of a source document.
      const sources = f.sources.filter(
        (src) => validPages.get(src.documentId)?.has(src.pageNumber) ?? false,
      );
      if (sources.length === 0) return null;

      let informationStatus: CrossStatus = ALLOWED_STATUS.has(f.informationStatus)
        ? (f.informationStatus as CrossStatus)
        : "INFERRED"; // strips CONFIRMED_MATCH and any other illegal status
      let explanation = f.explanation;

      // A "paid" conclusion is only FOUND when a cited document has receipt
      // evidence; otherwise it is an inference with a verification step.
      if (PAID_RE.test(f.title) && !sources.some((s) => hasReceipt(s.documentId))) {
        informationStatus = "INFERRED";
        if (!/verify/i.test(explanation)) explanation += VERIFY_STEP;
      }

      return { id: f.id, title: f.title, explanation, informationStatus, sources };
    })
    .filter((f): f is NonNullable<typeof f> => f !== null);

  return {
    category: raw.category,
    overview: raw.overview,
    explanation: raw.explanation,
    findings,
    limitations: raw.limitations,
  };
}

/* -------------------------------------------------------------------------- */
/* getCrossAnalysis                                                           */
/* -------------------------------------------------------------------------- */

export type GetCrossAnalysisDeps = {
  authorize: (userId: string, crossAnalysisId: string) => Promise<boolean>;
  load: (
    crossAnalysisId: string,
  ) => Promise<{
    status: "RUNNING" | "SUCCEEDED" | "FAILED";
    documentIds: string[];
    report: unknown;
  } | null>;
};

/**
 * Read a cross-analysis. Owner-or-shared only; otherwise NOT_FOUND so its
 * existence is not revealed.
 */
export async function getCrossAnalysis(
  userId: string,
  crossAnalysisId: string,
  deps: GetCrossAnalysisDeps = defaultGetDeps(),
): Promise<z.infer<typeof crossAnalysisResponseSchema>> {
  if (!(await deps.authorize(userId, crossAnalysisId))) {
    throw new AppError("NOT_FOUND");
  }
  const row = await deps.load(crossAnalysisId);
  if (!row) throw new AppError("NOT_FOUND");

  return crossAnalysisResponseSchema.parse({
    crossAnalysisId,
    documentIds: row.documentIds,
    status: row.status,
    result:
      row.status === "SUCCEEDED" && row.report != null
        ? crossAnalysisResultSchema.parse(row.report)
        : undefined,
  });
}

/* -------------------------------------------------------------------------- */
/* Production data access (service-role admin client)                         */
/* -------------------------------------------------------------------------- */

async function authorizeDocument(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  documentId: string,
): Promise<boolean> {
  const { data: doc } = await admin
    .from("documents")
    .select("user_id")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) return false;
  if (doc.user_id === userId) return true;
  const { data: share } = await admin
    .from("document_shares")
    .select("id")
    .eq("document_id", documentId)
    .eq("shared_with_user_id", userId)
    .maybeSingle();
  return Boolean(share);
}

/** Latest SUCCEEDED analysis for a document, or null. */
async function latestSucceeded(
  admin: ReturnType<typeof createAdminClient>,
  documentId: string,
) {
  const { data } = await admin
    .from("document_analyses")
    .select("report_json")
    .eq("document_id", documentId)
    .eq("status", "SUCCEEDED")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

const COMPACT_FINDING_LISTS = [
  "keyInformation",
  "obligations",
  "watchouts",
  "consequences",
  "nextSteps",
  "importantDates",
] as const;

/** Reduce a parsed analysis to compact findings + its valid page numbers. */
function toSummary(
  documentId: string,
  report: unknown,
): DocumentCompactSummary {
  const result = parseAnalysisResult(report, { documentId });
  const pageOf = new Map(result.evidence.map((e) => [e.id, e.pageNumber]));
  const validPages = [...new Set(result.evidence.map((e) => e.pageNumber))];

  const findings = COMPACT_FINDING_LISTS.flatMap((list) =>
    result[list].map((f) => ({
      title: f.title,
      informationStatus: f.informationStatus,
      pages: [
        ...new Set(
          f.evidenceIds
            .map((id) => pageOf.get(id))
            .filter((p): p is number => p !== undefined),
        ),
      ],
    })),
  );

  return { documentId, category: result.document.documentType, findings, validPages };
}

function defaultRequestDeps(): CrossAnalysisDeps {
  const admin = createAdminClient();
  return {
    authorize: (userId, documentId) =>
      authorizeDocument(admin, userId, documentId),
    async hasCompletedAnalysis(documentId) {
      return (await latestSucceeded(admin, documentId)) !== null;
    },
    async insertAnalysis({ userId, documentIds }) {
      const { data, error } = await admin
        .from("cross_document_analyses")
        .insert({ user_id: userId, status: "RUNNING" })
        .select("id")
        .single();
      if (error) throw error;
      const crossAnalysisId = data.id as string;
      const { error: joinError } = await admin
        .from("cross_document_analysis_documents")
        .insert(
          documentIds.map((documentId) => ({
            cross_document_analysis_id: crossAnalysisId,
            document_id: documentId,
            user_id: userId,
          })),
        );
      if (joinError) throw joinError;
      return crossAnalysisId;
    },
    enqueue: (input) => enqueueJob(input),
  };
}

function defaultJobDeps(): CrossAnalyzeJobDeps {
  const admin = createAdminClient();
  return {
    async loadSummaries(documentIds) {
      const summaries = await Promise.all(
        documentIds.map(async (documentId) => {
          const row = await latestSucceeded(admin, documentId);
          if (!row) throw new Error("document has no completed analysis");
          return toSummary(documentId, row.report_json);
        }),
      );
      return summaries;
    },
    chat: getChatProvider(),
    async save(crossAnalysisId, status, result) {
      const { error } = await admin
        .from("cross_document_analyses")
        .update({
          status,
          report_json: (result ?? null) as Record<string, unknown> | null,
        })
        .eq("id", crossAnalysisId);
      if (error) throw error;
    },
  };
}

function defaultGetDeps(): GetCrossAnalysisDeps {
  const admin = createAdminClient();
  return {
    async authorize(userId, crossAnalysisId) {
      const { data } = await admin
        .from("cross_document_analyses")
        .select("user_id")
        .eq("id", crossAnalysisId)
        .maybeSingle();
      return Boolean(data && data.user_id === userId);
    },
    async load(crossAnalysisId) {
      const { data } = await admin
        .from("cross_document_analyses")
        .select("status, report_json")
        .eq("id", crossAnalysisId)
        .maybeSingle();
      if (!data) return null;
      const { data: joins } = await admin
        .from("cross_document_analysis_documents")
        .select("document_id")
        .eq("cross_document_analysis_id", crossAnalysisId);
      return {
        status: data.status as "RUNNING" | "SUCCEEDED" | "FAILED",
        documentIds: (joins ?? []).map((j) => j.document_id as string),
        report: data.report_json,
      };
    },
  };
}

/** Register the CROSS_ANALYZE handler with the job runner. */
export function registerCrossAnalyzeHandler(): void {
  registerJobHandler("CROSS_ANALYZE", makeCrossAnalyzeHandler(defaultJobDeps()));
}

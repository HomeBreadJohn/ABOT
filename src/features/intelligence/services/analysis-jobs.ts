import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  ANALYSIS_SCHEMA_VERSION,
  parseAnalysisResult,
  type AnalysisResult,
  type DocumentCategory,
  type DocumentLifecycle,
  type ExplanationLanguage,
} from "@/contracts";
import type { NormalizedPage } from "@/lib/providers/ocr-provider";
import {
  buildEffectivePages,
  type EffectiveCorrection,
} from "@/features/corrections/services/effective-pages";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logging/logger";
import { transitionDocument } from "@/features/processing/services/lifecycle";
import {
  type JobHandler,
  type JobOutcome,
  registerJobHandler,
} from "@/features/processing/services/job-registry";
import type {
  AnalysisEngine,
  OcrCorrection,
} from "@/features/intelligence/services/analysis-engine";
import { FixtureAnalysisEngine } from "@/features/intelligence/services/fixture-analysis-engine";
import { RealAnalysisEngine } from "@/features/intelligence/services/real-analysis-engine";
import { getChatProvider } from "@/lib/providers";
import { getProviderEnv } from "@/lib/env/server";

type AnalysisOutcome = "COMPLETED" | "REVIEW_REQUIRED" | "NEEDS_CORRECTION";

/** Injectable dependencies so the handler can run against fakes in tests. */
export type AnalyzeJobDeps = {
  admin: SupabaseClient;
  engine: AnalysisEngine;
  loadPages: (admin: SupabaseClient, documentId: string) => Promise<NormalizedPage[]>;
  loadCorrections: (
    admin: SupabaseClient,
    documentId: string,
  ) => Promise<OcrCorrection[]>;
  loadLanguage: (
    admin: SupabaseClient,
    documentId: string,
  ) => Promise<ExplanationLanguage>;
  loadStatus: (
    admin: SupabaseClient,
    documentId: string,
  ) => Promise<"OCR_READY" | "OCR_PARTIAL">;
  transition: typeof transitionDocument;
  persist: (input: {
    documentId: string;
    idempotencyKey: string;
    result: AnalysisResult;
    language: ExplanationLanguage;
    outcome: AnalysisOutcome;
  }) => Promise<{ analysisId: string }>;
};

/**
 * ANALYZE: move the document to ANALYZING, run the engine, validate its result
 * against the contract, persist it idempotently, and move to the engine's
 * outcome. A result that fails validation is never persisted (no SUCCEEDED row)
 * and the document moves to ANALYSIS_FAILED.
 */
export function makeAnalyzeHandler(deps: AnalyzeJobDeps): JobHandler {
  return async (job): Promise<JobOutcome> => {
    const from = await deps.loadStatus(deps.admin, job.documentId);
    await deps.transition(deps.admin, job.documentId, from, "ANALYZING");

    const [pages, corrections, language] = await Promise.all([
      deps.loadPages(deps.admin, job.documentId),
      deps.loadCorrections(deps.admin, job.documentId),
      deps.loadLanguage(deps.admin, job.documentId),
    ]);

    const { result, outcome } = await deps.engine.analyze({
      documentId: job.documentId,
      pages,
      corrections,
      language,
    });

    let validated: AnalysisResult;
    try {
      validated = parseAnalysisResult(result, { documentId: job.documentId });
    } catch {
      // Never log the invalid report; only allowlisted fields.
      logger.error("analysis result failed validation", {
        documentId: job.documentId,
        jobId: job.id,
        errorCode: "INVALID_ANALYSIS",
      });
      await deps.transition(
        deps.admin,
        job.documentId,
        "ANALYZING",
        "ANALYSIS_FAILED",
      );
      return { kind: "fail", errorCode: "INVALID_ANALYSIS" };
    }

    const version = validated.analysisMetadata.analysisVersion;
    await deps.persist({
      documentId: job.documentId,
      idempotencyKey: `analyze:${job.documentId}:${version}`,
      result: validated,
      language,
      outcome,
    });

    // persist_analysis updates documents.processing_status to the outcome in
    // the same transaction, so there is no separate transition here.
    return { kind: "done" };
  };
}

/** The lifecycle states a document can be reanalyzed from. */
type ReanalyzeFrom = "COMPLETED" | "REVIEW_REQUIRED" | "NEEDS_CORRECTION";

/** Injectable dependencies for the REANALYZE handler. */
export type ReanalyzeJobDeps = {
  admin: SupabaseClient;
  engine: AnalysisEngine;
  loadPages: (admin: SupabaseClient, documentId: string) => Promise<NormalizedPage[]>;
  /** Stored corrections projected onto word ranges, for buildEffectivePages. */
  loadEffectiveCorrections: (
    admin: SupabaseClient,
    documentId: string,
  ) => Promise<EffectiveCorrection[]>;
  loadLanguage: (
    admin: SupabaseClient,
    documentId: string,
  ) => Promise<ExplanationLanguage>;
  loadCategory: (
    admin: SupabaseClient,
    documentId: string,
  ) => Promise<DocumentCategory | undefined>;
  /** The document's current max analysis version; the new version is this + 1. */
  loadCurrentVersion: (
    admin: SupabaseClient,
    documentId: string,
  ) => Promise<number>;
  loadStatus: (
    admin: SupabaseClient,
    documentId: string,
  ) => Promise<ReanalyzeFrom>;
  transition: typeof transitionDocument;
  persist: (input: {
    documentId: string;
    idempotencyKey: string;
    result: AnalysisResult;
    language: ExplanationLanguage;
    outcome: AnalysisOutcome;
  }) => Promise<{ analysisId: string }>;
};

/**
 * REANALYZE: rerun analysis after a correction (B17) or a module-changing
 * category switch (B6). It overlays the document's corrections onto the OCR
 * pages with buildEffectivePages, so only pages whose text actually changed
 * produce a new chunk hash — unchanged chunks hit the hybrid engine's cache and
 * send no chunk message. The result is persisted as a NEW version (current + 1)
 * through the same persist path, keyed `reanalyze:<documentId>:<version>`, so
 * the previous version stays readable through GET /api/analyses/:id.
 */
export function makeReanalyzeHandler(deps: ReanalyzeJobDeps): JobHandler {
  return async (job): Promise<JobOutcome> => {
    const from = await deps.loadStatus(deps.admin, job.documentId);
    await deps.transition(deps.admin, job.documentId, from, "ANALYZING");

    const [pages, corrections, language, category, currentVersion] =
      await Promise.all([
        deps.loadPages(deps.admin, job.documentId),
        deps.loadEffectiveCorrections(deps.admin, job.documentId),
        deps.loadLanguage(deps.admin, job.documentId),
        deps.loadCategory(deps.admin, job.documentId),
        deps.loadCurrentVersion(deps.admin, job.documentId),
      ]);

    // Overlay corrections: words get USER_CORRECTION/corrected text, and each
    // corrected page's `text` is rebuilt so chunking sees the change.
    const effectivePages = applyEffectiveText(
      buildEffectivePages(pages, corrections),
      corrections,
    );

    const { result, outcome } = await deps.engine.analyze({
      documentId: job.documentId,
      pages: effectivePages,
      corrections: [],
      language,
      category,
    });

    const version = currentVersion + 1;
    // The engine always stamps version 1; this is a new version.
    result.analysisMetadata.analysisVersion = version;

    let validated: AnalysisResult;
    try {
      validated = parseAnalysisResult(result, { documentId: job.documentId });
    } catch {
      logger.error("reanalysis result failed validation", {
        documentId: job.documentId,
        jobId: job.id,
        errorCode: "INVALID_ANALYSIS",
      });
      await deps.transition(
        deps.admin,
        job.documentId,
        "ANALYZING",
        "ANALYSIS_FAILED",
      );
      return { kind: "fail", errorCode: "INVALID_ANALYSIS" };
    }

    await deps.persist({
      documentId: job.documentId,
      idempotencyKey: `reanalyze:${job.documentId}:${version}`,
      result: validated,
      language,
      outcome,
    });

    return { kind: "done" };
  };
}

/**
 * Rebuild `text` from the effective words only for pages that carry a
 * correction, so chunking (which reads page.text) sees the corrected text and
 * that chunk's hash changes. Pages without a correction keep their original
 * `text` byte-for-byte, so their chunk hash is unchanged and hits the cache.
 */
function applyEffectiveText(
  pages: ReturnType<typeof buildEffectivePages>,
  corrections: EffectiveCorrection[],
): NormalizedPage[] {
  const correctedPages = new Set(corrections.map((c) => c.pageNumber));
  return pages.map((page) => {
    if (!correctedPages.has(page.pageNumber)) return page;
    return { ...page, text: page.words.map((w) => w.text).join(" ") };
  });
}

const FINDING_LISTS = [
  ["keyInformation", "KEY_INFORMATION"],
  ["obligations", "OBLIGATION"],
  ["watchouts", "WATCHOUT"],
  ["consequences", "CONSEQUENCE"],
  ["nextSteps", "NEXT_STEP"],
  ["importantDates", "IMPORTANT_DATE"],
] as const;

/** Flatten the analysis finding lists into the rows persist_analysis expects. */
function toFindingRows(result: AnalysisResult) {
  const rows: Record<string, unknown>[] = [];
  for (const [list, findingType] of FINDING_LISTS) {
    for (const f of result[list]) {
      rows.push({
        findingType,
        title: f.title,
        explanation: f.explanation,
        severity: f.severity ?? null,
        informationStatus: f.informationStatus,
        confidence: f.confidence,
        basis: f.basis,
        evidenceIds: f.evidenceIds,
      });
    }
  }
  return rows;
}

/**
 * Call persist_analysis: insert the version, findings, and evidence and set the
 * document status, all in one transaction. A repeated idempotency key returns
 * the existing analysis id without inserting a second version.
 */
async function persistAnalysis(
  admin: SupabaseClient,
  input: {
    documentId: string;
    idempotencyKey: string;
    result: AnalysisResult;
    language: ExplanationLanguage;
    outcome: AnalysisOutcome;
  },
): Promise<{ analysisId: string }> {
  const { data, error } = await admin.rpc("persist_analysis", {
    p_document_id: input.documentId,
    // The function derives the owner from the document; this is ignored.
    p_user_id: input.documentId,
    p_idempotency_key: input.idempotencyKey,
    p_report: input.result as unknown as Record<string, unknown>,
    p_schema_version: ANALYSIS_SCHEMA_VERSION,
    p_language: input.language,
    p_model_instance_id: input.result.analysisMetadata.modelInstanceId,
    p_findings: toFindingRows(input.result),
    p_evidence: input.result.evidence,
    p_outcome: input.outcome,
  });
  if (error) throw error;
  return { analysisId: (data as string) ?? "" };
}

async function loadPages(
  admin: SupabaseClient,
  documentId: string,
): Promise<NormalizedPage[]> {
  const { data, error } = await admin
    .from("document_pages")
    .select("page_number, extracted_text, ocr_status, average_confidence, page_metadata")
    .eq("document_id", documentId)
    .order("page_number");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    pageNumber: row.page_number as number,
    status: row.ocr_status as "READY" | "FAILED",
    text: row.extracted_text as string,
    words:
      ((row.page_metadata as { words?: NormalizedPage["words"] } | null)?.words) ??
      [],
    averageConfidence: row.average_confidence as number | null,
  }));
}

async function loadCorrections(): Promise<OcrCorrection[]> {
  // Corrections feed reanalysis (Task B6+); the first analysis has none.
  return [];
}

async function loadLanguage(
  admin: SupabaseClient,
  documentId: string,
): Promise<ExplanationLanguage> {
  const { data } = await admin
    .from("documents")
    .select("language")
    .eq("id", documentId)
    .single();
  return ((data?.language as ExplanationLanguage | null) ?? "EN");
}

async function loadStatus(
  admin: SupabaseClient,
  documentId: string,
): Promise<"OCR_READY" | "OCR_PARTIAL"> {
  const { data, error } = await admin
    .from("documents")
    .select("processing_status")
    .eq("id", documentId)
    .single();
  if (error || !data) throw new Error("document not found for analysis");
  const status = data.processing_status as DocumentLifecycle;
  if (status !== "OCR_READY" && status !== "OCR_PARTIAL") {
    throw new Error(`document not ready for analysis: ${status}`);
  }
  return status;
}

/** Stored corrections as word ranges, for buildEffectivePages on reanalysis. */
async function loadEffectiveCorrections(
  admin: SupabaseClient,
  documentId: string,
): Promise<EffectiveCorrection[]> {
  const { data, error } = await admin
    .from("ocr_corrections")
    .select("page_number, word_start, word_end, corrected_value, created_at")
    .eq("document_id", documentId);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    pageNumber: r.page_number as number,
    wordStart: r.word_start as number,
    wordEnd: r.word_end as number,
    correctedValue: (r.corrected_value as string | null) ?? null,
    createdAt: r.created_at as string,
  }));
}

async function loadCategory(
  admin: SupabaseClient,
  documentId: string,
): Promise<DocumentCategory | undefined> {
  const { data } = await admin
    .from("documents")
    .select("category")
    .eq("id", documentId)
    .single();
  return (data?.category as DocumentCategory | null) ?? undefined;
}

/** Current max analysis version for the document, or 0 when none exists yet. */
async function loadCurrentVersion(
  admin: SupabaseClient,
  documentId: string,
): Promise<number> {
  const { data } = await admin
    .from("document_analyses")
    .select("version")
    .eq("document_id", documentId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.version as number | null) ?? 0;
}

/** The lifecycle a reanalysis may start from; anything else is an error. */
async function loadReanalyzeStatus(
  admin: SupabaseClient,
  documentId: string,
): Promise<"COMPLETED" | "REVIEW_REQUIRED" | "NEEDS_CORRECTION"> {
  const { data, error } = await admin
    .from("documents")
    .select("processing_status")
    .eq("id", documentId)
    .single();
  if (error || !data) throw new Error("document not found for reanalysis");
  const status = data.processing_status as DocumentLifecycle;
  if (
    status !== "COMPLETED" &&
    status !== "REVIEW_REQUIRED" &&
    status !== "NEEDS_CORRECTION"
  ) {
    throw new Error(`document not ready for reanalysis: ${status}`);
  }
  return status;
}

/**
 * The production engine. Mock mode keeps the deterministic fixture engine; any
 * other mode runs the real engine over the chat provider. Constructed once per
 * handler registration so its chunk cache persists across an ANALYZE and the
 * REANALYZE of the same document in the same process — that is what lets a
 * targeted reanalysis reuse unchanged chunks.
 */
function buildEngine(): AnalysisEngine {
  return getProviderEnv().mode === "mock"
    ? new FixtureAnalysisEngine()
    : new RealAnalysisEngine(getChatProvider());
}

/** Build the default, production-wired ANALYZE dependencies. */
function defaultDeps(admin: SupabaseClient, engine: AnalysisEngine): AnalyzeJobDeps {
  return {
    admin,
    engine,
    loadPages,
    loadCorrections,
    loadLanguage,
    loadStatus,
    transition: transitionDocument,
    persist: (input) => persistAnalysis(admin, input),
  };
}

/** Build the default, production-wired REANALYZE dependencies. */
function defaultReanalyzeDeps(
  admin: SupabaseClient,
  engine: AnalysisEngine,
): ReanalyzeJobDeps {
  return {
    admin,
    engine,
    loadPages,
    loadEffectiveCorrections,
    loadLanguage,
    loadCategory,
    loadCurrentVersion,
    loadStatus: loadReanalyzeStatus,
    transition: transitionDocument,
    persist: (input) => persistAnalysis(admin, input),
  };
}

/**
 * Register the ANALYZE and REANALYZE handlers, both wired to one shared engine
 * instance so the chunk cache is reused between a document's first analysis and
 * its later targeted reanalyses.
 */
export function registerAnalysisHandlers(): void {
  const admin = createAdminClient();
  const engine = buildEngine();
  registerJobHandler("ANALYZE", makeAnalyzeHandler(defaultDeps(admin, engine)));
  registerJobHandler(
    "REANALYZE",
    makeReanalyzeHandler(defaultReanalyzeDeps(admin, engine)),
  );
}

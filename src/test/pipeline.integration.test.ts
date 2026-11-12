/**
 * End-to-end pipeline test: upload-complete -> OCR_SUBMIT -> OCR_POLL ->
 * OCR_FETCH -> ANALYZE, driven by the real job runner and the real handlers.
 *
 * It uses the mock OCR provider and an in-memory stand-in for Storage, the
 * processing_jobs store, and the Postgres pipeline tables (documents,
 * document_pages, persist_analysis). This proves the handler chain end to end
 * without credentials.
 *
 * shortcut: not a hosted-DB run. A full hosted run (PROVIDER_MODE=mock against
 * the real Supabase instance through the tick route) is a manual check; see
 * TODO below. Upgrade to a hosted run once a disposable test schema exists so
 * CI can reset it between runs.
 *
 * TODO(hosted): with a disposable Supabase schema, register real handlers via
 * registerPipelineHandlers(), seed an UPLOADED document and its stored file,
 * POST the tick route with JOB_RUNNER_SECRET, and assert a COMPLETED document
 * with one SUCCEEDED analysis whose findings/evidence rows match report_json.
 */
import { describe, expect, it } from "vitest";

import {
  ANALYSIS_SCHEMA_VERSION,
  canTransition,
  mockUtilityBillAnalysis,
  type AnalysisResult,
  type DocumentLifecycle,
} from "@/contracts";
import {
  registerJobHandler,
  type EnqueueInput,
} from "@/features/processing/services/job-registry";
import {
  enqueueJob,
  runDueJobs,
  type JobStore,
  type StoredJob,
} from "@/features/processing/services/job-runner";
import { MockOcrProvider } from "@/lib/providers";
import type { NormalizedPage } from "@/lib/providers/ocr-provider";
import {
  makeOcrFetchHandler,
  makeOcrPollHandler,
  makeOcrSubmitHandler,
} from "@/features/ocr/services/ocr-jobs";
import { makeAnalyzeHandler } from "@/features/intelligence/services/analysis-jobs";
import { FixtureAnalysisEngine } from "@/features/intelligence/services/fixture-analysis-engine";

type AnalysisOutcome = "COMPLETED" | "REVIEW_REQUIRED" | "NEEDS_CORRECTION";

/** In-memory Postgres stand-in for the pipeline tables plus persist_analysis. */
function createFakeDb(documentId: string, userId: string) {
  const document = {
    id: documentId,
    user_id: userId,
    status: "UPLOADED" as DocumentLifecycle,
    ocr_document_id: null as string | null,
    language: "EN" as const,
  };
  const pages: NormalizedPage[] = [];
  const analyses: {
    documentId: string;
    key: string;
    version: number;
    status: "SUCCEEDED";
    report: AnalysisResult;
    findings: { findingType: string; evidenceIds: string[] }[];
    evidence: { id: string }[];
    outcome: AnalysisOutcome;
  }[] = [];

  return {
    document,
    pages,
    analyses,
    transition(
      _admin: unknown,
      id: string,
      from: DocumentLifecycle,
      to: DocumentLifecycle,
    ) {
      if (id !== documentId) throw new Error("wrong document");
      if (document.status !== from || !canTransition(from, to)) {
        throw new Error(`bad transition ${from} -> ${to} (at ${document.status})`);
      }
      document.status = to;
      return Promise.resolve();
    },
    persist(input: {
      documentId: string;
      idempotencyKey: string;
      result: AnalysisResult;
      outcome: AnalysisOutcome;
    }) {
      const existing = analyses.find(
        (a) => a.documentId === input.documentId && a.key === input.idempotencyKey,
      );
      if (existing) return Promise.resolve({ analysisId: `a-${existing.version}` });
      const version = analyses.length + 1;
      const findings = [
        ...input.result.keyInformation,
        ...input.result.obligations,
        ...input.result.watchouts,
        ...input.result.consequences,
        ...input.result.nextSteps,
        ...input.result.importantDates,
      ].map((f) => ({ findingType: "FINDING", evidenceIds: f.evidenceIds }));
      analyses.push({
        documentId: input.documentId,
        key: input.idempotencyKey,
        version,
        status: "SUCCEEDED",
        report: input.result,
        findings,
        evidence: input.result.evidence.map((e) => ({ id: e.id })),
        outcome: input.outcome,
      });
      // persist_analysis sets the document status to the outcome.
      document.status = input.outcome;
      return Promise.resolve({ analysisId: `a-${version}` });
    },
  };
}

/** In-memory processing_jobs store with claim_processing_job semantics. */
function createMemoryStore() {
  let seq = 0;
  const rows: StoredJob[] = [];
  const now = () => Date.now();
  const store: JobStore = {
    async enqueue(input: EnqueueInput) {
      if (rows.some((r) => r.idempotencyKey === input.idempotencyKey)) {
        return { jobId: "", created: false };
      }
      const jobId = `job-${++seq}`;
      rows.push({
        id: jobId,
        documentId: input.documentId,
        userId: input.userId,
        jobType: input.type,
        step: null,
        payload: input.payload ?? {},
        idempotencyKey: input.idempotencyKey,
        status: "queued",
        runAfter: 0,
        leaseExpiresAt: null,
        attempts: 0,
        maxAttempts: 100,
        errorCode: null,
      });
      return { jobId, created: true };
    },
    async claim(leaseSeconds) {
      // Ignore run_after here so the poll backoff does not stall the test; the
      // 40-poll cap still protects against an infinite loop.
      const job = rows.find(
        (r) => r.status === "queued" || r.status === "RETRY_SCHEDULED",
      );
      if (!job) return null;
      job.status = "processing";
      job.leaseExpiresAt = now() + leaseSeconds * 1000;
      job.attempts += 1;
      return {
        id: job.id,
        documentId: job.documentId,
        userId: job.userId,
        jobType: job.jobType,
        step: job.step,
        payload: job.payload,
        attempts: job.attempts,
        maxAttempts: job.maxAttempts,
      };
    },
    async complete(jobId) {
      const job = rows.find((r) => r.id === jobId);
      if (job) job.status = "completed";
    },
    async scheduleRetry(jobId) {
      const job = rows.find((r) => r.id === jobId);
      if (job) job.status = "RETRY_SCHEDULED";
    },
    async fail(jobId, errorCode) {
      const job = rows.find((r) => r.id === jobId);
      if (job) {
        job.status = "failed";
        job.errorCode = errorCode;
      }
    },
  };
  return { store, rows };
}

describe("pipeline end-to-end (handler chain with fakes)", () => {
  it("drives UPLOADED through OCR to one COMPLETED analysis whose rows match the report", async () => {
    const documentId = "11111111-1111-1111-1111-111111111111";
    const userId = "22222222-2222-2222-2222-222222222222";
    const db = createFakeDb(documentId, userId);
    const provider = new MockOcrProvider();
    const { store } = createMemoryStore();

    const ocrDeps = {
      admin: {} as never,
      provider,
      downloadBytes: async () => ({
        bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
        mimeType: "application/pdf" as const,
        filename: "bill.pdf",
      }),
      setOcrDocumentId: async (_a: unknown, _id: string, provId: string) => {
        db.document.ocr_document_id = provId;
      },
      transition: db.transition,
      persistPages: async (
        _a: unknown,
        _id: string,
        _u: string,
        pages: NormalizedPage[],
      ) => {
        db.pages.splice(0, db.pages.length, ...pages);
      },
    };

    registerJobHandler("OCR_SUBMIT", makeOcrSubmitHandler(ocrDeps as never));
    registerJobHandler("OCR_POLL", makeOcrPollHandler(ocrDeps as never));
    registerJobHandler("OCR_FETCH", makeOcrFetchHandler(ocrDeps as never));
    registerJobHandler(
      "ANALYZE",
      makeAnalyzeHandler({
        admin: {} as never,
        engine: new FixtureAnalysisEngine(),
        loadPages: async () => db.pages,
        loadCorrections: async () => [],
        loadLanguage: async () => "EN",
        loadStatus: async () =>
          db.document.status as "OCR_READY" | "OCR_PARTIAL",
        transition: db.transition,
        persist: db.persist,
      }),
    );

    // The upload-complete step enqueues OCR_SUBMIT; mirror that here.
    await enqueueJob(
      {
        documentId,
        userId,
        type: "OCR_SUBMIT",
        idempotencyKey: `ocr-submit:${documentId}`,
      },
      store,
    );

    // Run the runner repeatedly until the queue drains (poll retries re-run).
    for (let i = 0; i < 100; i++) {
      const { ran } = await runDueJobs(1_000, store);
      if (ran === 0) break;
    }

    expect(db.document.status).toBe("COMPLETED");
    expect(db.document.ocr_document_id).toBe("mock-ocr:bill.pdf");
    expect(db.pages.length).toBeGreaterThan(0);

    // Exactly one analysis, version 1, SUCCEEDED, correct schema version.
    expect(db.analyses).toHaveLength(1);
    const analysis = db.analyses[0];
    expect(analysis.version).toBe(1);
    expect(analysis.status).toBe("SUCCEEDED");
    expect(analysis.report.schemaVersion).toBe(ANALYSIS_SCHEMA_VERSION);
    expect(analysis.report.document.documentId).toBe(documentId);

    // Findings/evidence rows match the report JSON.
    const reportEvidenceIds = analysis.report.evidence.map((e) => e.id).sort();
    expect(analysis.evidence.map((e) => e.id).sort()).toEqual(reportEvidenceIds);
    const reportFindingCount =
      analysis.report.keyInformation.length +
      analysis.report.obligations.length +
      analysis.report.watchouts.length +
      analysis.report.consequences.length +
      analysis.report.nextSteps.length +
      analysis.report.importantDates.length;
    expect(analysis.findings).toHaveLength(reportFindingCount);
    // Every evidence id a finding cites exists in the stored evidence rows.
    const storedEvidence = new Set(analysis.evidence.map((e) => e.id));
    for (const f of analysis.findings) {
      for (const id of f.evidenceIds) expect(storedEvidence.has(id)).toBe(true);
    }
    // The fixture carries the real documentId everywhere (sanity vs. mock-doc-1).
    expect(mockUtilityBillAnalysis.document.documentId).not.toBe(documentId);
  });
});

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
  parseAnalysisResult,
  type AnalysisResult,
  type DocumentLifecycle,
} from "@/contracts";
import { MockChatProvider } from "@/lib/providers";
import { RealAnalysisEngine } from "@/features/intelligence/services/real-analysis-engine";
import { utilityBillPages } from "@/lib/providers/mock/fixtures/utility-bill-pages";
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

  it("drives a low-confidence amount through the real engine to NEEDS_CORRECTION with evidence on the amount words", async () => {
    const documentId = "33333333-3333-3333-3333-333333333333";

    // Utility-bill page 1 text with a low OCR confidence on the amount words
    // ("PHP 2,450.00"), so the critical-field rule flags it REQUIRED.
    const page1 = utilityBillPages[0];
    const lowAmountWords = page1.words.map((w) =>
      /2,450\.00|PHP/.test(w.text) ? { ...w, confidence: 0.6 } : w,
    );
    const pages: NormalizedPage[] = [
      { ...page1, words: lowAmountWords, averageConfidence: 0.8 },
    ];

    const chat = new MockChatProvider();
    // Classify -> UTILITIES, confident.
    chat.respondWith(
      (m) => m.includes("You classify a document"),
      JSON.stringify({
        category: "UTILITIES",
        subtype: "Electricity bill",
        issuer: "Sample Electric Cooperative",
        confidence: 0.95,
        candidates: [{ category: "UTILITIES", confidence: 0.95 }],
      }),
    );
    // Per-chunk -> one KEY_INFORMATION finding whose quote is the amount line.
    chat.respondWith(
      (m) => m.includes("per-chunk analysis"),
      JSON.stringify({
        findings: [
          {
            type: "KEY_INFORMATION",
            title: "Amount due",
            explanation: "The bill states PHP 2,450.00 is due.",
            informationStatus: "FOUND",
            confidence: 0.9,
            basis: "Billing summary line.",
            quote: "Amount Due: PHP 2,450.00",
            page: 1,
          },
        ],
      }),
    );
    // Consolidation -> overview and explanation.
    chat.respondWith(
      (m) => m.includes("Consolidate these findings"),
      JSON.stringify({
        overview: "A monthly electricity bill.",
        explanation: "This is your electricity bill for the month.",
      }),
    );

    const engine = new RealAnalysisEngine(chat);
    const { result, outcome } = await engine.analyze({
      documentId,
      pages,
      corrections: [],
      language: "EN",
    });

    // The report validates against the contract with the real document id.
    const validated = parseAnalysisResult(result, { documentId });

    expect(outcome).toBe("NEEDS_CORRECTION");

    const required = validated.reviewRequirements.filter(
      (r) => r.reviewStatus === "REQUIRED",
    );
    expect(required).toHaveLength(1);
    expect(required[0].impactLevel).toBe("CRITICAL");

    // The flagged finding has evidence whose word range points at the amount.
    const flagged = validated.keyInformation.find(
      (f) => f.id === required[0].findingId,
    );
    expect(flagged).toBeDefined();
    const evidence = validated.evidence.find((e) =>
      flagged!.evidenceIds.includes(e.id),
    );
    expect(evidence).toBeDefined();
    expect(evidence!.sourceType).toBe("OCR_TEXT");
    // The amount line is words 1..4 ("Amount Due: PHP 2,450.00") on page 1.
    expect(evidence!.pageNumber).toBe(1);
    expect(evidence!.excerpt).toContain("2,450.00");
  });

  it("resolves a finding whose quote appears only on a late page (>=4) to that page's words", async () => {
    const documentId = "44444444-4444-4444-4444-444444444444";

    // A five-page document. The supporting quote appears ONLY on page 5. With
    // the claimed page hardcoded to 1, mapQuoteToEvidence (page +/-1) never
    // reaches page 5 and the evidence is silently lost. The chunk finding
    // carries the real page (5) via the structured quote channel.
    const mk = (pageNumber: number, text: string): NormalizedPage => {
      const words = text
        .split(/\s+/)
        .filter(Boolean)
        .map((word, index) => ({ index, text: word, confidence: 0.95 }));
      return {
        pageNumber,
        status: "READY",
        text,
        words,
        averageConfidence: 0.95,
      };
    };
    const pages: NormalizedPage[] = [
      mk(1, "Cover page with introductory boilerplate text only."),
      mk(2, "Second page of generic terms and background."),
      mk(3, "Third page describing the account and service details."),
      mk(4, "Fourth page listing contact information and notices."),
      mk(5, "The late payment penalty is 2 percent per month overdue."),
    ];

    const chat = new MockChatProvider();
    chat.respondWith(
      (m) => m.includes("You classify a document"),
      JSON.stringify({
        category: "UTILITIES",
        subtype: "Electricity bill",
        issuer: "Sample Electric Cooperative",
        confidence: 0.95,
        candidates: [{ category: "UTILITIES", confidence: 0.95 }],
      }),
    );
    // One WATCHOUT finding whose quote lives only on page 5.
    chat.respondWith(
      (m) => m.includes("per-chunk analysis"),
      JSON.stringify({
        findings: [
          {
            type: "WATCHOUT",
            title: "Late payment penalty",
            explanation: "A penalty applies to overdue payments.",
            informationStatus: "FOUND",
            confidence: 0.9,
            basis: "Penalty clause.",
            quote: "The late payment penalty is 2 percent per month overdue.",
            page: 5,
          },
        ],
      }),
    );
    chat.respondWith(
      (m) => m.includes("Consolidate these findings"),
      JSON.stringify({
        overview: "A monthly electricity bill.",
        explanation: "This is your electricity bill for the month.",
      }),
    );

    const engine = new RealAnalysisEngine(chat);
    const { result } = await engine.analyze({
      documentId,
      pages,
      corrections: [],
      language: "EN",
    });

    const validated = parseAnalysisResult(result, { documentId });

    const watchout = validated.watchouts.find(
      (f) => f.title === "Late payment penalty",
    );
    expect(watchout).toBeDefined();
    // The evidence must resolve to page 5 — the bug drops it entirely.
    expect(watchout!.evidenceIds).toHaveLength(1);
    const evidence = validated.evidence.find((e) =>
      watchout!.evidenceIds.includes(e.id),
    );
    expect(evidence).toBeDefined();
    expect(evidence!.pageNumber).toBe(5);
    expect(evidence!.sourceType).toBe("OCR_TEXT");
    expect(evidence!.excerpt).toContain("penalty");
  });

  it("drops a fabricated quote: the finding keeps no evidence and no evidence row is invented", async () => {
    const documentId = "55555555-5555-5555-5555-555555555555";

    // A one-page document. The AI returns a quote that does NOT appear in the
    // OCR text. mapQuoteToEvidence must return null, so the engine attaches no
    // evidence and fabricates nothing.
    const pages: NormalizedPage[] = [
      {
        pageNumber: 1,
        status: "READY",
        text: "Monthly electricity bill for the service address on file.",
        words: "Monthly electricity bill for the service address on file."
          .split(/\s+/)
          .filter(Boolean)
          .map((word, index) => ({ index, text: word, confidence: 0.95 })),
        averageConfidence: 0.95,
      },
    ];

    const chat = new MockChatProvider();
    chat.respondWith(
      (m) => m.includes("You classify a document"),
      JSON.stringify({
        category: "UTILITIES",
        subtype: "Electricity bill",
        issuer: "Sample Electric Cooperative",
        confidence: 0.95,
        candidates: [{ category: "UTILITIES", confidence: 0.95 }],
      }),
    );
    // One finding whose supporting quote is absent from the OCR text entirely.
    chat.respondWith(
      (m) => m.includes("per-chunk analysis"),
      JSON.stringify({
        findings: [
          {
            type: "KEY_INFORMATION",
            title: "Court-ordered account closure",
            explanation: "The account has been closed by order of the court.",
            informationStatus: "FOUND",
            confidence: 0.9,
            basis: "Legal notice.",
            quote: "Your account has been permanently closed by order of the court.",
            page: 1,
          },
        ],
      }),
    );
    chat.respondWith(
      (m) => m.includes("Consolidate these findings"),
      JSON.stringify({
        overview: "A monthly electricity bill.",
        explanation: "This is your electricity bill for the month.",
      }),
    );

    const engine = new RealAnalysisEngine(chat);
    const { result } = await engine.analyze({
      documentId,
      pages,
      corrections: [],
      language: "EN",
    });

    const validated = parseAnalysisResult(result, { documentId });

    const finding = validated.keyInformation.find(
      (f) => f.title === "Court-ordered account closure",
    );
    expect(finding).toBeDefined();
    // The fabricated quote maps to nothing: no evidence ids, no evidence rows.
    expect(finding!.evidenceIds).toEqual([]);
    expect(validated.evidence).toHaveLength(0);
  });
});

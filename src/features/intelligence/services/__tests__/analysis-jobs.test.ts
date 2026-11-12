import { describe, expect, it, vi } from "vitest";

import { mockUtilityBillAnalysis } from "@/contracts";
import type { ClaimedJob } from "@/features/processing/services/job-registry";
import type { NormalizedPage } from "@/lib/providers/ocr-provider";
import type {
  AnalysisEngine,
  AnalysisEngineResult,
} from "@/features/intelligence/services/analysis-engine";
import {
  makeAnalyzeHandler,
  makeReanalyzeHandler,
  type AnalyzeJobDeps,
  type ReanalyzeJobDeps,
} from "@/features/intelligence/services/analysis-jobs";

type PersistInput = Parameters<AnalyzeJobDeps["persist"]>[0];
import { FixtureAnalysisEngine } from "@/features/intelligence/services/fixture-analysis-engine";

function job(overrides: Partial<ClaimedJob> = {}): ClaimedJob {
  return {
    id: "job-1",
    documentId: "doc-1",
    userId: "user-1",
    jobType: "ANALYZE",
    step: null,
    payload: {},
    attempts: 1,
    maxAttempts: 5,
    ...overrides,
  };
}

const pages: NormalizedPage[] = [
  {
    pageNumber: 1,
    status: "READY",
    text: "Amount Due",
    words: [{ index: 0, text: "Amount", confidence: 0.9 }],
    averageConfidence: 0.9,
  },
];

/**
 * In-memory stand-in for persist_analysis: idempotent on (documentId,
 * idempotencyKey), bumps the version otherwise. Records every SUCCEEDED row.
 */
function fakePersist() {
  const rows: { documentId: string; key: string; version: number }[] = [];
  const persist = vi.fn(
    async (input: PersistInput) => {
      const existing = rows.find(
        (r) => r.documentId === input.documentId && r.key === input.idempotencyKey,
      );
      if (existing) return { analysisId: `analysis-${existing.version}` };
      const version = rows.length + 1;
      rows.push({ documentId: input.documentId, key: input.idempotencyKey, version });
      return { analysisId: `analysis-${version}` };
    },
  );
  return { persist, rows };
}

function baseDeps(overrides: Partial<AnalyzeJobDeps> = {}): AnalyzeJobDeps {
  const { persist } = fakePersist();
  return {
    admin: {} as never,
    engine: new FixtureAnalysisEngine(),
    loadPages: vi.fn(async () => pages),
    loadCorrections: vi.fn(async () => []),
    loadLanguage: vi.fn(async () => "EN" as const),
    loadStatus: vi.fn(async () => "OCR_READY" as const),
    transition: vi.fn(async () => {}),
    persist,
    ...overrides,
  };
}

describe("ANALYZE", () => {
  it("transitions ANALYZING, runs the engine, persists, and transitions to the outcome", async () => {
    const { persist, rows } = fakePersist();
    const deps = baseDeps({ persist });
    const handler = makeAnalyzeHandler(deps);

    const outcome = await handler(job(), {});

    expect(deps.transition).toHaveBeenNthCalledWith(
      1,
      deps.admin,
      "doc-1",
      "OCR_READY",
      "ANALYZING",
    );
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist.mock.calls[0][0].idempotencyKey).toBe("analyze:doc-1:1");
    expect(persist.mock.calls[0][0].outcome).toBe("COMPLETED");
    expect(rows).toHaveLength(1);
    expect(outcome).toEqual({ kind: "done" });
  });

  it("starts from OCR_PARTIAL too", async () => {
    const deps = baseDeps({ loadStatus: vi.fn(async () => "OCR_PARTIAL" as const) });
    const handler = makeAnalyzeHandler(deps);

    await handler(job(), {});

    expect(deps.transition).toHaveBeenNthCalledWith(
      1,
      deps.admin,
      "doc-1",
      "OCR_PARTIAL",
      "ANALYZING",
    );
  });

  it("transitions ANALYSIS_FAILED and persists no SUCCEEDED row when the engine result is invalid", async () => {
    const { persist, rows } = fakePersist();
    // Engine returns a result whose evidence belongs to another document, so
    // parseAnalysisResult throws before anything is persisted.
    const badEngine: AnalysisEngine = {
      async analyze(): Promise<AnalysisEngineResult> {
        return { result: mockUtilityBillAnalysis, outcome: "COMPLETED" };
      },
    };
    const deps = baseDeps({ engine: badEngine, persist });
    const handler = makeAnalyzeHandler(deps);

    const outcome = await handler(job(), {});

    expect(persist).not.toHaveBeenCalled();
    expect(rows).toHaveLength(0);
    expect(deps.transition).toHaveBeenLastCalledWith(
      deps.admin,
      "doc-1",
      "ANALYZING",
      "ANALYSIS_FAILED",
    );
    expect(outcome).toEqual({ kind: "fail", errorCode: "INVALID_ANALYSIS" });
  });

  it("leaves exactly one analysis version when run twice with the same key", async () => {
    const { persist, rows } = fakePersist();
    const deps = baseDeps({ persist });
    const handler = makeAnalyzeHandler(deps);

    await handler(job(), {});
    await handler(job({ attempts: 2 }), {});

    expect(persist).toHaveBeenCalledTimes(2);
    expect(rows).toHaveLength(1);
  });
});

/**
 * REANALYZE runs after a correction or a module-changing category switch. It
 * mirrors ANALYZE but builds effective pages from the document's corrections,
 * persists the NEXT version (current + 1), and keys idempotency per version.
 */
describe("REANALYZE", () => {
  const twoPages: NormalizedPage[] = [
    {
      pageNumber: 1,
      status: "READY",
      text: "Total amount due 1,250.00",
      words: [
        { index: 0, text: "Total", confidence: 0.9 },
        { index: 1, text: "amount", confidence: 0.9 },
        { index: 2, text: "due", confidence: 0.9 },
        { index: 3, text: "1,250.00", confidence: 0.4 },
      ],
      averageConfidence: 0.75,
    },
    {
      pageNumber: 2,
      status: "READY",
      text: "Account number 0001",
      words: [
        { index: 0, text: "Account", confidence: 0.9 },
        { index: 1, text: "number", confidence: 0.9 },
        { index: 2, text: "0001", confidence: 0.9 },
      ],
      averageConfidence: 0.9,
    },
  ];

  function reanalyzeDeps(
    overrides: Partial<ReanalyzeJobDeps> = {},
  ): ReanalyzeJobDeps {
    const { persist } = fakePersist();
    return {
      admin: {} as never,
      engine: new FixtureAnalysisEngine(),
      loadPages: vi.fn(async () => twoPages),
      loadEffectiveCorrections: vi.fn(async () => []),
      loadLanguage: vi.fn(async () => "EN" as const),
      loadCategory: vi.fn(async () => "UTILITIES" as const),
      loadCurrentVersion: vi.fn(async () => 1),
      loadStatus: vi.fn(async () => "COMPLETED" as const),
      transition: vi.fn(async () => {}),
      persist,
      ...overrides,
    };
  }

  it("transitions ANALYZING from COMPLETED, runs the engine, and persists", async () => {
    const { persist } = fakePersist();
    const deps = reanalyzeDeps({ persist });
    const handler = makeReanalyzeHandler(deps);

    const outcome = await handler(job({ jobType: "REANALYZE" }), {});

    expect(deps.transition).toHaveBeenNthCalledWith(
      1,
      deps.admin,
      "doc-1",
      "COMPLETED",
      "ANALYZING",
    );
    expect(persist).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual({ kind: "done" });
  });

  it("persists the next version (current + 1) and keys idempotency by that version", async () => {
    const { persist } = fakePersist();
    const deps = reanalyzeDeps({
      persist,
      loadCurrentVersion: vi.fn(async () => 3),
    });
    const handler = makeReanalyzeHandler(deps);

    await handler(job({ jobType: "REANALYZE" }), {});

    const input = persist.mock.calls[0][0];
    expect(input.idempotencyKey).toBe("reanalyze:doc-1:4");
    expect(input.result.analysisMetadata.analysisVersion).toBe(4);
  });

  it("feeds effective pages built from corrections to the engine", async () => {
    // A spy engine records the pages it is handed so we can assert the
    // corrected text reached it (changed chunk -> cache miss downstream).
    const seen: NormalizedPage[] = [];
    const engine = {
      async analyze(input: {
        documentId: string;
        pages: NormalizedPage[];
        corrections: unknown;
        language: "EN";
      }) {
        seen.push(...input.pages);
        return new FixtureAnalysisEngine().analyze({
          ...input,
          corrections: [],
        });
      },
    } as never;
    const deps = reanalyzeDeps({
      engine,
      loadEffectiveCorrections: vi.fn(async () => [
        { pageNumber: 1, wordStart: 3, wordEnd: 3, correctedValue: "1,260.00" },
      ]),
    });
    const handler = makeReanalyzeHandler(deps);

    await handler(job({ jobType: "REANALYZE" }), {});

    const page1 = seen.find((p) => p.pageNumber === 1)!;
    const page2 = seen.find((p) => p.pageNumber === 2)!;
    // Page 1's text reflects the correction (so its chunk hash changes).
    expect(page1.text).toContain("1,260.00");
    expect(page1.text).not.toContain("1,250.00");
    // Page 2 has no correction, so its original text is byte-for-byte intact
    // (so its chunk hash is identical and hits the cache).
    expect(page2.text).toBe("Account number 0001");
  });

  it("leaves exactly one version when run twice with the same key", async () => {
    const { persist, rows } = fakePersist();
    const deps = reanalyzeDeps({ persist });
    const handler = makeReanalyzeHandler(deps);

    await handler(job({ jobType: "REANALYZE" }), {});
    await handler(job({ jobType: "REANALYZE", attempts: 2 }), {});

    expect(persist).toHaveBeenCalledTimes(2);
    expect(rows).toHaveLength(1);
  });

  it("transitions ANALYSIS_FAILED and persists nothing when the result is invalid", async () => {
    const { persist, rows } = fakePersist();
    const badEngine: AnalysisEngine = {
      async analyze(): Promise<AnalysisEngineResult> {
        // Fixture carries another document's id -> cross-reference check throws.
        return { result: mockUtilityBillAnalysis, outcome: "COMPLETED" };
      },
    };
    const deps = reanalyzeDeps({ engine: badEngine, persist });
    const handler = makeReanalyzeHandler(deps);

    const outcome = await handler(job({ jobType: "REANALYZE" }), {});

    expect(persist).not.toHaveBeenCalled();
    expect(rows).toHaveLength(0);
    expect(deps.transition).toHaveBeenLastCalledWith(
      deps.admin,
      "doc-1",
      "ANALYZING",
      "ANALYSIS_FAILED",
    );
    expect(outcome).toEqual({ kind: "fail", errorCode: "INVALID_ANALYSIS" });
  });
});

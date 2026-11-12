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
  type AnalyzeJobDeps,
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

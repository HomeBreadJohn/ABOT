import { describe, expect, it, vi } from "vitest";

import { AppError } from "@/lib/http/app-error";
import { MockChatProvider } from "@/lib/providers/mock/mock-chat-provider";
import {
  getCrossAnalysis,
  makeCrossAnalyzeHandler,
  requestCrossAnalysis,
  type CrossAnalysisDeps,
  type CrossAnalyzeJobDeps,
  type DocumentCompactSummary,
} from "@/features/relationships/services/cross-analysis";

const OWNER = "11111111-1111-1111-1111-111111111111";
const STRANGER = "99999999-9999-9999-9999-999999999999";
const DOC_A = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const DOC_B = "3f2504e0-4f89-11d3-9a0c-0305e82c3302";
const DOC_C = "3f2504e0-4f89-11d3-9a0c-0305e82c3303";

function summary(
  documentId: string,
  overrides: Partial<DocumentCompactSummary> = {},
): DocumentCompactSummary {
  return {
    documentId,
    category: "UTILITIES",
    validPages: [1],
    findings: [
      { title: "Amount due PHP 2,450.00", informationStatus: "FOUND", pages: [1] },
    ],
    ...overrides,
  };
}

function makeRequestDeps(
  overrides: Partial<CrossAnalysisDeps> = {},
): CrossAnalysisDeps & { _inserted: unknown[]; _enqueued: unknown[] } {
  const inserted: unknown[] = [];
  const enqueued: unknown[] = [];
  return {
    authorize: vi.fn(async () => true),
    hasCompletedAnalysis: vi.fn(async () => true),
    insertAnalysis: vi.fn(async (input: { userId: string; documentIds: string[] }) => {
      inserted.push(input);
      return "cross-1";
    }),
    enqueue: vi.fn(async (input) => {
      enqueued.push(input);
      return { jobId: "job-1", created: true };
    }),
    _inserted: inserted,
    _enqueued: enqueued,
    ...overrides,
  } as CrossAnalysisDeps & { _inserted: unknown[]; _enqueued: unknown[] };
}

describe("requestCrossAnalysis", () => {
  it("accepts 2-5 authorized documents that each have a completed analysis", async () => {
    const deps = makeRequestDeps();

    const result = await requestCrossAnalysis(OWNER, [DOC_A, DOC_B], deps);

    expect(result.crossAnalysisId).toBe("cross-1");
    expect(result.documentIds).toEqual([DOC_A, DOC_B]);
    expect(deps._inserted).toHaveLength(1);
    expect(deps._enqueued).toHaveLength(1);
  });

  it("rejects fewer than 2 document IDs", async () => {
    const deps = makeRequestDeps();
    const err = await requestCrossAnalysis(OWNER, [DOC_A], deps).catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe("INVALID_REQUEST");
    expect(deps.insertAnalysis).not.toHaveBeenCalled();
  });

  it("rejects more than 5 document IDs", async () => {
    const deps = makeRequestDeps();
    const err = await requestCrossAnalysis(
      OWNER,
      [DOC_A, DOC_B, DOC_C, "d4", "d5", "d6"],
      deps,
    ).catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe("INVALID_REQUEST");
  });

  it("returns NOT_FOUND when a document is not owned or shared", async () => {
    const deps = makeRequestDeps({
      authorize: vi.fn(async (_u, documentId) => documentId === DOC_A),
    });
    const err = await requestCrossAnalysis(STRANGER, [DOC_A, DOC_B], deps).catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe("NOT_FOUND");
    expect(deps.insertAnalysis).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND when a document has no completed analysis", async () => {
    const deps = makeRequestDeps({
      hasCompletedAnalysis: vi.fn(async (documentId) => documentId === DOC_A),
    });
    const err = await requestCrossAnalysis(OWNER, [DOC_A, DOC_B], deps).catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe("NOT_FOUND");
    expect(deps.insertAnalysis).not.toHaveBeenCalled();
  });
});

function makeJobDeps(
  chat: MockChatProvider,
  summaries: DocumentCompactSummary[],
  overrides: Partial<CrossAnalyzeJobDeps> = {},
): CrossAnalyzeJobDeps & { _saved: { status: string; result?: unknown }[] } {
  const saved: { status: string; result?: unknown }[] = [];
  return {
    loadSummaries: vi.fn(async () => summaries),
    chat,
    save: vi.fn(async (_id: string, status: string, result?: unknown) => {
      saved.push({ status, result });
    }),
    _saved: saved,
    ...overrides,
  } as CrossAnalyzeJobDeps & { _saved: { status: string; result?: unknown }[] };
}

function job(payload: unknown) {
  return {
    id: "job-1",
    documentId: DOC_A,
    userId: OWNER,
    jobType: "CROSS_ANALYZE" as const,
    step: null,
    payload: payload as never,
    attempts: 1,
    maxAttempts: 5,
  };
}

const PAYLOAD = { crossAnalysisId: "cross-1", documentIds: [DOC_A, DOC_B] };

describe("CROSS_ANALYZE handler", () => {
  it("sends compact findings (titles and pages) and never full OCR text", async () => {
    const chat = new MockChatProvider();
    let seen = "";
    const spy = new MockChatProvider();
    spy.send = async (_s, message) => {
      seen = message;
      return {
        reply: JSON.stringify({
          category: "UTILITIES",
          overview: "o",
          explanation: "e",
          findings: [],
          limitations: [],
        }),
      };
    };
    void chat;
    const summaries = [
      summary(DOC_A, {
        findings: [
          { title: "Amount due PHP 2,450.00", informationStatus: "FOUND", pages: [1] },
        ],
      }),
      summary(DOC_B),
    ];
    const deps = makeJobDeps(spy, summaries);

    await makeCrossAnalyzeHandler(deps)(job(PAYLOAD), {});

    expect(seen).toContain("Amount due PHP 2,450.00");
    expect(seen).toContain("page 1");
    // No raw OCR page text leaks in.
    expect(seen).not.toContain("Total electricity consumption for the billing period");
  });

  it("drops findings that cite no source document", async () => {
    const spy = new MockChatProvider();
    spy.send = async () => ({
      reply: JSON.stringify({
        category: "UTILITIES",
        overview: "o",
        explanation: "e",
        findings: [
          {
            id: "f1",
            title: "Same account across both documents",
            explanation: "x",
            informationStatus: "FOUND",
            sources: [{ documentId: DOC_A, pageNumber: 1 }],
          },
          {
            id: "f2",
            title: "Unsourced claim",
            explanation: "y",
            informationStatus: "FOUND",
            sources: [],
          },
        ],
        limitations: [],
      }),
    });
    const deps = makeJobDeps(spy, [summary(DOC_A), summary(DOC_B)]);

    await makeCrossAnalyzeHandler(deps)(job(PAYLOAD), {});

    const saved = deps._saved[0];
    expect(saved.status).toBe("SUCCEEDED");
    const result = saved.result as { findings: { id: string }[] };
    expect(result.findings.map((f) => f.id)).toEqual(["f1"]);
  });

  it("drops findings whose sources cite a page not in any source document", async () => {
    const spy = new MockChatProvider();
    spy.send = async () => ({
      reply: JSON.stringify({
        category: "UTILITIES",
        overview: "o",
        explanation: "e",
        findings: [
          {
            id: "f1",
            title: "Fabricated page",
            explanation: "x",
            informationStatus: "FOUND",
            sources: [{ documentId: DOC_A, pageNumber: 99 }],
          },
        ],
        limitations: [],
      }),
    });
    const deps = makeJobDeps(spy, [summary(DOC_A), summary(DOC_B)]);

    await makeCrossAnalyzeHandler(deps)(job(PAYLOAD), {});

    const result = deps._saved[0].result as { findings: unknown[] };
    expect(result.findings).toHaveLength(0);
  });

  it("strips a CONFIRMED_MATCH status the AI tries to output", async () => {
    const spy = new MockChatProvider();
    spy.send = async () => ({
      reply: JSON.stringify({
        category: "UTILITIES",
        overview: "o",
        explanation: "e",
        findings: [
          {
            id: "f1",
            title: "Documents match",
            explanation: "x",
            informationStatus: "CONFIRMED_MATCH",
            sources: [{ documentId: DOC_A, pageNumber: 1 }],
          },
        ],
        limitations: [],
      }),
    });
    const deps = makeJobDeps(spy, [summary(DOC_A), summary(DOC_B)]);

    await makeCrossAnalyzeHandler(deps)(job(PAYLOAD), {});

    const result = deps._saved[0].result as {
      findings: { informationStatus: string }[];
    };
    // The finding is kept but its illegal status is replaced with INFERRED.
    expect(result.findings[0].informationStatus).not.toBe("CONFIRMED_MATCH");
    expect(result.findings[0].informationStatus).toBe("INFERRED");
  });

  it("downgrades a 'bill is paid' claim without receipt evidence to INFERRED with a verification step", async () => {
    const spy = new MockChatProvider();
    spy.send = async () => ({
      reply: JSON.stringify({
        category: "UTILITIES",
        overview: "o",
        explanation: "e",
        findings: [
          {
            id: "f1",
            title: "The electricity bill is paid",
            explanation: "The amounts match.",
            informationStatus: "FOUND",
            sources: [{ documentId: DOC_A, pageNumber: 1 }],
          },
        ],
        limitations: [],
      }),
    });
    // Neither document carries a receipt/paid reference.
    const deps = makeJobDeps(spy, [summary(DOC_A), summary(DOC_B)]);

    await makeCrossAnalyzeHandler(deps)(job(PAYLOAD), {});

    const result = deps._saved[0].result as {
      findings: { informationStatus: string; explanation: string }[];
    };
    expect(result.findings[0].informationStatus).toBe("INFERRED");
    expect(result.findings[0].explanation.toLowerCase()).toContain("verify");
  });

  it("keeps a 'bill is paid' claim as FOUND when a source document has receipt evidence", async () => {
    const spy = new MockChatProvider();
    spy.send = async () => ({
      reply: JSON.stringify({
        category: "UTILITIES",
        overview: "o",
        explanation: "e",
        findings: [
          {
            id: "f1",
            title: "The electricity bill is paid",
            explanation: "A receipt confirms payment.",
            informationStatus: "FOUND",
            sources: [{ documentId: DOC_B, pageNumber: 1 }],
          },
        ],
        limitations: [],
      }),
    });
    const deps = makeJobDeps(spy, [
      summary(DOC_A),
      summary(DOC_B, {
        findings: [
          {
            title: "Official Receipt No. 12345 — payment received",
            informationStatus: "FOUND",
            pages: [1],
          },
        ],
      }),
    ]);

    await makeCrossAnalyzeHandler(deps)(job(PAYLOAD), {});

    const result = deps._saved[0].result as {
      findings: { informationStatus: string }[];
    };
    expect(result.findings[0].informationStatus).toBe("FOUND");
  });

  it("stores the validated result with status SUCCEEDED", async () => {
    const spy = new MockChatProvider();
    spy.send = async () => ({
      reply: JSON.stringify({
        category: "UTILITIES",
        overview: "Two related utility documents.",
        explanation: "e",
        findings: [
          {
            id: "f1",
            title: "Same account number appears in both",
            explanation: "x",
            informationStatus: "FOUND",
            sources: [
              { documentId: DOC_A, pageNumber: 1 },
              { documentId: DOC_B, pageNumber: 1 },
            ],
          },
        ],
        limitations: ["Based only on the extracted findings."],
      }),
    });
    const deps = makeJobDeps(spy, [summary(DOC_A), summary(DOC_B)]);

    const outcome = await makeCrossAnalyzeHandler(deps)(job(PAYLOAD), {});

    expect(outcome.kind).toBe("done");
    expect(deps.save).toHaveBeenCalledWith(
      "cross-1",
      "SUCCEEDED",
      expect.objectContaining({ category: "UTILITIES" }),
    );
  });
});

describe("getCrossAnalysis", () => {
  it("returns a RUNNING response before the job finishes", async () => {
    const deps: Parameters<typeof getCrossAnalysis>[2] = {
      authorize: vi.fn(async () => true),
      load: vi.fn(async () => ({
        status: "RUNNING" as const,
        documentIds: [DOC_A, DOC_B],
        report: null,
      })),
    };

    const response = await getCrossAnalysis(OWNER, "cross-1", deps);

    expect(response.status).toBe("RUNNING");
    expect(response.result).toBeUndefined();
    expect(response.documentIds).toEqual([DOC_A, DOC_B]);
  });

  it("returns the SUCCEEDED result once stored", async () => {
    const report = {
      category: "UTILITIES",
      overview: "o",
      explanation: "e",
      findings: [
        {
          id: "f1",
          title: "t",
          explanation: "x",
          informationStatus: "FOUND",
          sources: [{ documentId: DOC_A, pageNumber: 1 }],
        },
      ],
      limitations: [],
    };
    const deps: Parameters<typeof getCrossAnalysis>[2] = {
      authorize: vi.fn(async () => true),
      load: vi.fn(async () => ({
        status: "SUCCEEDED" as const,
        documentIds: [DOC_A, DOC_B],
        report,
      })),
    };

    const response = await getCrossAnalysis(OWNER, "cross-1", deps);

    expect(response.status).toBe("SUCCEEDED");
    expect(response.result?.category).toBe("UTILITIES");
  });

  it("returns NOT_FOUND when the analysis is not owned or shared", async () => {
    const deps: Parameters<typeof getCrossAnalysis>[2] = {
      authorize: vi.fn(async () => false),
      load: vi.fn(async () => null),
    };

    const err = await getCrossAnalysis(STRANGER, "cross-1", deps).catch((e) => e);

    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe("NOT_FOUND");
  });
});

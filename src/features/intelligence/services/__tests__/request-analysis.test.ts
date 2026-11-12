import { describe, expect, it, vi } from "vitest";

import { analyzeResponseSchema } from "@/contracts";
import { AppError } from "@/lib/http/app-error";
import type { DocumentLifecycle } from "@/contracts";
import {
  requestAnalysis,
  type RequestAnalysisDeps,
} from "@/features/intelligence/services/request-analysis";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const DOC_ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const JOB_ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3401";
const ORIGIN = "https://app.test";

function makeDeps(
  lifecycle: DocumentLifecycle,
  overrides: Partial<RequestAnalysisDeps> = {},
): RequestAnalysisDeps {
  return {
    loadLifecycle: vi.fn(async () => lifecycle),
    countRecentAnalyzeJobs: vi.fn(async () => 0),
    enqueue: vi.fn(async () => ({ jobId: JOB_ID, created: true })),
    kick: vi.fn(),
    ...overrides,
  };
}

describe("requestAnalysis", () => {
  it("RETRY on OCR_FAILED enqueues OCR_SUBMIT", async () => {
    const deps = makeDeps("OCR_FAILED");
    const result = await requestAnalysis(
      USER_ID,
      DOC_ID,
      { mode: "RETRY", idempotencyKey: "k1" },
      ORIGIN,
      deps,
    );

    expect(analyzeResponseSchema.parse(result)).toEqual(result);
    expect(deps.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: DOC_ID,
        userId: USER_ID,
        type: "OCR_SUBMIT",
        idempotencyKey: "k1",
      }),
    );
    expect(deps.kick).toHaveBeenCalledWith(ORIGIN);
  });

  it("RETRY on ANALYSIS_FAILED enqueues ANALYZE", async () => {
    const deps = makeDeps("ANALYSIS_FAILED");
    await requestAnalysis(
      USER_ID,
      DOC_ID,
      { mode: "RETRY", idempotencyKey: "k1" },
      ORIGIN,
      deps,
    );
    expect(deps.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ type: "ANALYZE" }),
    );
  });

  it("START from OCR_READY enqueues ANALYZE", async () => {
    const deps = makeDeps("OCR_READY");
    await requestAnalysis(
      USER_ID,
      DOC_ID,
      { mode: "START", idempotencyKey: "k1" },
      ORIGIN,
      deps,
    );
    expect(deps.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ type: "ANALYZE" }),
    );
  });

  it("START from OCR_PARTIAL enqueues ANALYZE", async () => {
    const deps = makeDeps("OCR_PARTIAL");
    await requestAnalysis(
      USER_ID,
      DOC_ID,
      { mode: "START", idempotencyKey: "k1" },
      ORIGIN,
      deps,
    );
    expect(deps.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ type: "ANALYZE" }),
    );
  });

  it("REANALYZE enqueues REANALYZE", async () => {
    const deps = makeDeps("COMPLETED");
    await requestAnalysis(
      USER_ID,
      DOC_ID,
      { mode: "REANALYZE", idempotencyKey: "k1" },
      ORIGIN,
      deps,
    );
    expect(deps.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ type: "REANALYZE" }),
    );
  });

  it("COMPLETED with a non-REANALYZE mode raises CONFLICT", async () => {
    const deps = makeDeps("COMPLETED");
    const err = await requestAnalysis(
      USER_ID,
      DOC_ID,
      { mode: "START", idempotencyKey: "k1" },
      ORIGIN,
      deps,
    ).catch((e) => e);

    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe("CONFLICT");
    expect(deps.enqueue).not.toHaveBeenCalled();
  });

  it("passes the idempotency key through so a repeat makes one job", async () => {
    // enqueueJob is idempotent on the key; a second call returns created:false.
    const enqueue = vi
      .fn()
      .mockResolvedValueOnce({ jobId: JOB_ID, created: true })
      .mockResolvedValueOnce({ jobId: JOB_ID, created: false });
    const deps = makeDeps("OCR_READY", { enqueue });

    const first = await requestAnalysis(
      USER_ID,
      DOC_ID,
      { mode: "START", idempotencyKey: "same" },
      ORIGIN,
      deps,
    );
    const second = await requestAnalysis(
      USER_ID,
      DOC_ID,
      { mode: "START", idempotencyKey: "same" },
      ORIGIN,
      deps,
    );

    expect(enqueue).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ idempotencyKey: "same" }),
    );
    expect(enqueue).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ idempotencyKey: "same" }),
    );
    expect(first.jobId).toBe(JOB_ID);
    expect(second.jobId).toBe(JOB_ID);
  });

  it("raises RATE_LIMITED after more than 10 analyze calls in the last hour", async () => {
    const deps = makeDeps("OCR_READY", {
      countRecentAnalyzeJobs: vi.fn(async () => 11),
    });
    const err = await requestAnalysis(
      USER_ID,
      DOC_ID,
      { mode: "START", idempotencyKey: "k1" },
      ORIGIN,
      deps,
    ).catch((e) => e);

    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe("RATE_LIMITED");
    expect(deps.enqueue).not.toHaveBeenCalled();
  });

  it("raises NOT_FOUND for another user's document", async () => {
    const deps = makeDeps("OCR_READY", {
      loadLifecycle: vi.fn(async () => null),
    });
    const err = await requestAnalysis(
      USER_ID,
      DOC_ID,
      { mode: "START", idempotencyKey: "k1" },
      ORIGIN,
      deps,
    ).catch((e) => e);

    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe("NOT_FOUND");
  });

  it("raises CONFLICT when START is requested from a non-ready state", async () => {
    const deps = makeDeps("OCR_PROCESSING");
    const err = await requestAnalysis(
      USER_ID,
      DOC_ID,
      { mode: "START", idempotencyKey: "k1" },
      ORIGIN,
      deps,
    ).catch((e) => e);

    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe("CONFLICT");
    expect(deps.enqueue).not.toHaveBeenCalled();
  });
});

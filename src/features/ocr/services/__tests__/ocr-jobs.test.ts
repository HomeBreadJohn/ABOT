import { describe, expect, it, vi } from "vitest";

import type { ClaimedJob, Json } from "@/features/processing/services/job-registry";
import type { NormalizedPage, OcrProvider } from "@/lib/providers/ocr-provider";
import {
  makeOcrFetchHandler,
  makeOcrPollHandler,
  makeOcrSubmitHandler,
  type OcrJobDeps,
} from "@/features/ocr/services/ocr-jobs";

function job(overrides: Partial<ClaimedJob> = {}): ClaimedJob {
  return {
    id: "job-1",
    documentId: "doc-1",
    userId: "user-1",
    jobType: "OCR_SUBMIT",
    step: null,
    payload: {},
    attempts: 1,
    maxAttempts: 100,
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

/** Fake OCR provider with scripted status responses. */
function fakeProvider(
  statuses: OcrStatus[],
  pagesOut: NormalizedPage[] = pages,
): OcrProvider & { submitCalls: number; getPagesCalls: number } {
  let statusIndex = 0;
  const self = {
    submitCalls: 0,
    getPagesCalls: 0,
    async submit() {
      self.submitCalls += 1;
      return { providerDocumentId: "prov-xyz" };
    },
    async getStatus() {
      const status = statuses[Math.min(statusIndex, statuses.length - 1)];
      statusIndex += 1;
      return { status };
    },
    async getPages() {
      self.getPagesCalls += 1;
      return pagesOut;
    },
    async retry() {},
  };
  return self;
}

type OcrStatus = "PENDING" | "PROCESSING" | "READY" | "PARTIAL" | "FAILED";

function baseDeps(overrides: Partial<OcrJobDeps> = {}): OcrJobDeps {
  return {
    admin: {} as never,
    provider: fakeProvider(["READY"]),
    downloadBytes: vi.fn(async () => ({
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: "application/pdf" as const,
      filename: "bill.pdf",
    })),
    setOcrDocumentId: vi.fn(async () => {}),
    transition: vi.fn(async () => {}),
    persistPages: vi.fn(async () => {}),
    ...overrides,
  };
}

describe("OCR_SUBMIT", () => {
  it("downloads, submits, stores the provider id, transitions, and queues OCR_POLL with the id in the payload", async () => {
    const provider = fakeProvider(["PROCESSING"]);
    const deps = baseDeps({ provider });
    const handler = makeOcrSubmitHandler(deps);

    const outcome = await handler(job(), {});

    expect(provider.submitCalls).toBe(1);
    expect(deps.setOcrDocumentId).toHaveBeenCalledWith(
      deps.admin,
      "doc-1",
      "prov-xyz",
    );
    expect(deps.transition).toHaveBeenCalledWith(
      deps.admin,
      "doc-1",
      "UPLOADED",
      "OCR_PROCESSING",
    );
    expect(outcome.kind).toBe("done");
    if (outcome.kind !== "done") throw new Error("expected done");
    expect(outcome.next).toHaveLength(1);
    const next = outcome.next![0];
    expect(next.type).toBe("OCR_POLL");
    expect((next.payload as { providerDocumentId: string }).providerDocumentId).toBe(
      "prov-xyz",
    );
  });
});

describe("OCR_POLL", () => {
  const pollPayload: Json = { providerDocumentId: "prov-xyz" };

  it("retries with 3s/6s/12s backoff capped at 60s while PROCESSING", async () => {
    const deps = baseDeps({ provider: fakeProvider(["PROCESSING"]) });
    const handler = makeOcrPollHandler(deps);

    const delays: number[] = [];
    for (const attempt of [1, 2, 3, 10]) {
      const outcome = await handler(
        job({ jobType: "OCR_POLL", payload: pollPayload, attempts: attempt }),
        {},
      );
      expect(outcome.kind).toBe("retry");
      if (outcome.kind === "retry") delays.push(outcome.afterMs);
    }

    expect(delays).toEqual([3_000, 6_000, 12_000, 60_000]);
  });

  it("returns done with OCR_FETCH carrying the provider id when READY", async () => {
    const deps = baseDeps({ provider: fakeProvider(["READY"]) });
    const handler = makeOcrPollHandler(deps);

    const outcome = await handler(
      job({ jobType: "OCR_POLL", payload: pollPayload }),
      {},
    );

    expect(outcome.kind).toBe("done");
    if (outcome.kind !== "done") throw new Error("expected done");
    expect(outcome.next![0].type).toBe("OCR_FETCH");
    expect(
      (outcome.next![0].payload as { providerDocumentId: string })
        .providerDocumentId,
    ).toBe("prov-xyz");
  });

  it("transitions OCR_FAILED and fails when the provider reports FAILED", async () => {
    const deps = baseDeps({ provider: fakeProvider(["FAILED"]) });
    const handler = makeOcrPollHandler(deps);

    const outcome = await handler(
      job({ jobType: "OCR_POLL", payload: pollPayload }),
      {},
    );

    expect(deps.transition).toHaveBeenCalledWith(
      deps.admin,
      "doc-1",
      "OCR_PROCESSING",
      "OCR_FAILED",
    );
    expect(outcome).toEqual({ kind: "fail", errorCode: "OCR_FAILED" });
  });

  it("fails with OCR_TIMEOUT after 40 polls", async () => {
    const deps = baseDeps({ provider: fakeProvider(["PROCESSING"]) });
    const handler = makeOcrPollHandler(deps);

    const outcome = await handler(
      job({ jobType: "OCR_POLL", payload: pollPayload, attempts: 41 }),
      {},
    );

    expect(outcome).toEqual({ kind: "fail", errorCode: "OCR_TIMEOUT" });
  });
});

describe("OCR_FETCH", () => {
  const fetchPayload: Json = { providerDocumentId: "prov-xyz" };

  it("fetches pages once, persists them, transitions OCR_READY, and queues ANALYZE", async () => {
    const provider = fakeProvider(["READY"], pages);
    const deps = baseDeps({ provider });
    const handler = makeOcrFetchHandler(deps);

    const outcome = await handler(
      job({ jobType: "OCR_FETCH", payload: fetchPayload }),
      {},
    );

    expect(provider.getPagesCalls).toBe(1);
    expect(deps.persistPages).toHaveBeenCalledWith(
      deps.admin,
      "doc-1",
      "user-1",
      pages,
    );
    expect(deps.transition).toHaveBeenCalledWith(
      deps.admin,
      "doc-1",
      "OCR_PROCESSING",
      "OCR_READY",
    );
    expect(outcome.kind).toBe("done");
    if (outcome.kind !== "done") throw new Error("expected done");
    expect(outcome.next![0].type).toBe("ANALYZE");
  });

  it("transitions OCR_PARTIAL when any page failed", async () => {
    const partial: NormalizedPage[] = [
      pages[0],
      { pageNumber: 2, status: "FAILED", text: "", words: [], averageConfidence: null },
    ];
    const deps = baseDeps({ provider: fakeProvider(["PARTIAL"], partial) });
    const handler = makeOcrFetchHandler(deps);

    await handler(job({ jobType: "OCR_FETCH", payload: fetchPayload }), {});

    expect(deps.transition).toHaveBeenCalledWith(
      deps.admin,
      "doc-1",
      "OCR_PROCESSING",
      "OCR_PARTIAL",
    );
  });
});

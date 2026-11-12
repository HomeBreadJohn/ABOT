import { describe, expect, it, vi } from "vitest";

import { AppError } from "@/lib/http/app-error";
import {
  submitCorrections,
  type SubmitCorrectionsDeps,
  type RequiredRequirement,
  type NewCorrection,
} from "@/features/corrections/services/submit-corrections";
import type { NormalizedPage } from "@/lib/providers/ocr-provider";

const OWNER = "11111111-1111-1111-1111-111111111111";
const RECIPIENT = "22222222-2222-2222-2222-222222222222";
const DOC = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

function page(): NormalizedPage {
  return {
    pageNumber: 1,
    status: "READY",
    text: "Total amount due 1,250.00 by March",
    words: [
      { index: 0, text: "Total", confidence: 0.9 },
      { index: 1, text: "amount", confidence: 0.9 },
      { index: 2, text: "due", confidence: 0.9 },
      { index: 3, text: "1,250.00", confidence: 0.4 },
      { index: 4, text: "by", confidence: 0.9 },
      { index: 5, text: "March", confidence: 0.5 },
    ],
    averageConfidence: 0.75,
  };
}

/** A REQUIRED item over the amount words (index 3) on page 1. */
function amountRequirement(): RequiredRequirement {
  return { id: "rr-1", findingId: "f-amount", pageNumber: 1, wordStart: 3, wordEnd: 3 };
}

type Inserted = {
  id: string;
  document_id: string;
  user_id: string;
  page_number: number;
  original_value: string;
  corrected_value: string | null;
  correction_status: string;
  word_start: number;
  word_end: number;
  created_at: string;
};

function makeDeps(
  overrides: Partial<SubmitCorrectionsDeps> = {},
): { deps: SubmitCorrectionsDeps; inserted: Inserted[] } {
  const inserted: Inserted[] = [];
  let seq = 0;
  const deps: SubmitCorrectionsDeps = {
    loadDocumentOwner: vi.fn(async () => OWNER),
    loadPage: vi.fn(async () => page()),
    loadRequiredRequirements: vi.fn(async () => [amountRequirement()]),
    loadPriorCorrectedRanges: vi.fn(async () => []),
    insertCorrections: vi.fn(async (rows: NewCorrection[]) => {
      const out = rows.map((r) => ({
        id: `c-${++seq}`,
        correction_status: "PENDING",
        created_at: "2026-01-01T00:00:00.000Z",
        ...r,
      }));
      inserted.push(...out);
      return out;
    }),
    enqueue: vi.fn(async () => ({ jobId: "job-1", created: true })),
    kick: vi.fn(),
    ...overrides,
  };
  return { deps, inserted };
}

describe("submitCorrections", () => {
  it("stores the original OCR words for the range and the corrected value", async () => {
    const { deps, inserted } = makeDeps();

    const result = await submitCorrections(
      OWNER,
      DOC,
      { items: [{ pageNumber: 1, wordStart: 3, wordEnd: 3, correctedValue: "1,260.00" }] },
      "https://app.test",
      deps,
    );

    expect(inserted).toHaveLength(1);
    expect(inserted[0].original_value).toBe("1,250.00");
    expect(inserted[0].corrected_value).toBe("1,260.00");
    expect(inserted[0].word_start).toBe(3);
    expect(inserted[0].word_end).toBe(3);
    // document_pages is never written by this service.
    expect(result.corrections[0].originalText).toBe("1,250.00");
    expect(result.corrections[0].correctedValue).toBe("1,260.00");
  });

  it("joins multi-word ranges into the original value", async () => {
    const { deps, inserted } = makeDeps();

    await submitCorrections(
      OWNER,
      DOC,
      { items: [{ pageNumber: 1, wordStart: 0, wordEnd: 2, correctedValue: "Balance owed" }] },
      "https://app.test",
      deps,
    );

    expect(inserted[0].original_value).toBe("Total amount due");
  });

  it("accepts UNREADABLE (no corrected value) and stores a null corrected_value", async () => {
    const { deps, inserted } = makeDeps();

    const result = await submitCorrections(
      OWNER,
      DOC,
      { items: [{ pageNumber: 1, wordStart: 3, wordEnd: 3 }] },
      "https://app.test",
      deps,
    );

    expect(inserted[0].corrected_value).toBeNull();
    expect(result.corrections[0].correctedValue).toBeNull();
  });

  it("rejects a word range outside the page with INVALID_REQUEST", async () => {
    const { deps } = makeDeps();

    const err = await submitCorrections(
      OWNER,
      DOC,
      { items: [{ pageNumber: 1, wordStart: 3, wordEnd: 99, correctedValue: "x" }] },
      "https://app.test",
      deps,
    ).catch((e) => e);

    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe("INVALID_REQUEST");
  });

  it("rejects a page that has no OCR with INVALID_REQUEST", async () => {
    const { deps } = makeDeps({ loadPage: vi.fn(async () => null) });

    const err = await submitCorrections(
      OWNER,
      DOC,
      { items: [{ pageNumber: 9, wordStart: 0, wordEnd: 0, correctedValue: "x" }] },
      "https://app.test",
      deps,
    ).catch((e) => e);

    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe("INVALID_REQUEST");
  });

  it("a recipient (non-owner) gets NOT_FOUND, not FORBIDDEN", async () => {
    const { deps } = makeDeps();

    const err = await submitCorrections(
      RECIPIENT,
      DOC,
      { items: [{ pageNumber: 1, wordStart: 3, wordEnd: 3, correctedValue: "x" }] },
      "https://app.test",
      deps,
    ).catch((e) => e);

    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe("NOT_FOUND");
    expect(deps.insertCorrections).not.toHaveBeenCalled();
  });

  it("enqueues REANALYZE with the correction-id hash key when all REQUIRED items are resolved", async () => {
    const { deps } = makeDeps();

    await submitCorrections(
      OWNER,
      DOC,
      { items: [{ pageNumber: 1, wordStart: 3, wordEnd: 3, correctedValue: "1,260.00" }] },
      "https://app.test",
      deps,
    );

    expect(deps.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: DOC,
        userId: OWNER,
        type: "REANALYZE",
        idempotencyKey: expect.stringMatching(/^reanalyze:3f2504e0-4f89-11d3-9a0c-0305e82c3301:[0-9a-f]+$/),
      }),
    );
    expect(deps.kick).toHaveBeenCalledWith("https://app.test");
  });

  it("does not enqueue REANALYZE when a REQUIRED item is still unresolved", async () => {
    // Two REQUIRED items; the correction only covers one.
    const { deps } = makeDeps({
      loadRequiredRequirements: vi.fn(async () => [
        amountRequirement(),
        { id: "rr-2", findingId: "f-date", pageNumber: 1, wordStart: 5, wordEnd: 5 },
      ]),
    });

    await submitCorrections(
      OWNER,
      DOC,
      { items: [{ pageNumber: 1, wordStart: 3, wordEnd: 3, correctedValue: "1,260.00" }] },
      "https://app.test",
      deps,
    );

    expect(deps.enqueue).not.toHaveBeenCalled();
  });

  it("stores a newer correction for the same range as a new row without touching the old one", async () => {
    // A prior correction already exists over the same range; this one supersedes
    // it but must be a NEW insert (never an update or delete of the old row).
    const { deps, inserted } = makeDeps({
      loadPriorCorrectedRanges: vi.fn(async () => [{ pageNumber: 1, wordStart: 3, wordEnd: 3 }]),
    });

    await submitCorrections(
      OWNER,
      DOC,
      { items: [{ pageNumber: 1, wordStart: 3, wordEnd: 3, correctedValue: "1,300.00" }] },
      "https://app.test",
      deps,
    );

    expect(deps.insertCorrections).toHaveBeenCalledTimes(1);
    expect(inserted).toHaveLength(1);
    expect(inserted[0].corrected_value).toBe("1,300.00");
    // The service only ever inserts; it exposes no update/delete path.
    expect(deps).not.toHaveProperty("updateCorrection");
    expect(deps).not.toHaveProperty("deleteCorrection");
  });

  it("counts a correction from a prior submission toward resolving REQUIRED items", async () => {
    // The amount was already corrected before; this batch resolves the date.
    const { deps } = makeDeps({
      loadRequiredRequirements: vi.fn(async () => [
        amountRequirement(),
        { id: "rr-2", findingId: "f-date", pageNumber: 1, wordStart: 5, wordEnd: 5 },
      ]),
      loadPriorCorrectedRanges: vi.fn(async () => [{ pageNumber: 1, wordStart: 3, wordEnd: 3 }]),
    });

    await submitCorrections(
      OWNER,
      DOC,
      { items: [{ pageNumber: 1, wordStart: 5, wordEnd: 5, correctedValue: "March 15" }] },
      "https://app.test",
      deps,
    );

    expect(deps.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ type: "REANALYZE" }),
    );
  });
});

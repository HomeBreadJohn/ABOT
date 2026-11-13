import { describe, expect, it } from "vitest";

import type { AnalysisResult } from "@/contracts/analysis";
import type { DocumentLifecycle } from "@/contracts/common";

import { groupVault, vaultAttentionReason } from "../common";
import { TODAY, shiftDate, type ProtoDoc } from "../data";

/**
 * Minimal ProtoDoc fixture. Only the fields groupVault/vaultAttentionReason
 * read are meaningful; the rest satisfy the type.
 */
function makeDoc(
  overrides: Partial<ProtoDoc> &
    Pick<ProtoDoc, "id" | "lifecycle" | "uploadedAt">,
): ProtoDoc {
  return {
    title: overrides.id,
    filename: `${overrides.id}.pdf`,
    category: null,
    step: 4,
    analysis: null,
    pending: null,
    pages: [],
    corrections: [],
    ...overrides,
  };
}

/** A completed doc whose only upcoming date lands `inDays` from TODAY. */
function completedWithDeadline(
  id: string,
  inDays: number,
  uploadedAt = TODAY,
): ProtoDoc {
  const analysis = {
    importantDates: [
      {
        id: `${id}-d`,
        title: "A deadline",
        date: shiftDate(TODAY, inDays),
      },
    ],
  } as unknown as AnalysisResult;
  return makeDoc({ id, lifecycle: "COMPLETED", uploadedAt, analysis });
}

describe("groupVault", () => {
  it("routes attention lifecycles into needsYou", () => {
    const lifecycles: DocumentLifecycle[] = [
      "NEEDS_CORRECTION",
      "REVIEW_REQUIRED",
      "OCR_FAILED",
      "ANALYSIS_FAILED",
    ];
    const docs = lifecycles.map((lc, i) =>
      makeDoc({ id: `a-${i}`, lifecycle: lc, uploadedAt: TODAY }),
    );
    const { needsYou, comingUp, ready } = groupVault(docs);
    expect(needsYou).toHaveLength(4);
    expect(comingUp).toHaveLength(0);
    expect(ready).toHaveLength(0);
  });

  it("orders needsYou by urgency: correction, failures, then review", () => {
    const docs = [
      makeDoc({ id: "review", lifecycle: "REVIEW_REQUIRED", uploadedAt: TODAY }),
      makeDoc({ id: "ocr", lifecycle: "OCR_FAILED", uploadedAt: TODAY }),
      makeDoc({ id: "fix", lifecycle: "NEEDS_CORRECTION", uploadedAt: TODAY }),
    ];
    const { needsYou } = groupVault(docs);
    expect(needsYou.map((d) => d.id)).toEqual(["fix", "ocr", "review"]);
  });

  it("puts a near deadline in comingUp and a far one in ready", () => {
    const near = completedWithDeadline("near", 10);
    const far = completedWithDeadline("far", 60);
    const { comingUp, ready } = groupVault([far, near]);
    expect(comingUp.map((d) => d.id)).toEqual(["near"]);
    expect(ready.map((d) => d.id)).toEqual(["far"]);
  });

  it("treats a deadline exactly 30 days out as coming up", () => {
    const edge = completedWithDeadline("edge", 30);
    const { comingUp } = groupVault([edge]);
    expect(comingUp.map((d) => d.id)).toEqual(["edge"]);
  });

  it("sorts comingUp by soonest deadline first", () => {
    const soon = completedWithDeadline("soon", 3);
    const later = completedWithDeadline("later", 20);
    const { comingUp } = groupVault([later, soon]);
    expect(comingUp.map((d) => d.id)).toEqual(["soon", "later"]);
  });

  it("sorts ready newest first", () => {
    const old = makeDoc({
      id: "old",
      lifecycle: "COMPLETED",
      uploadedAt: shiftDate(TODAY, -10),
    });
    const fresh = makeDoc({
      id: "fresh",
      lifecycle: "COMPLETED",
      uploadedAt: shiftDate(TODAY, -1),
    });
    const { ready } = groupVault([old, fresh]);
    expect(ready.map((d) => d.id)).toEqual(["fresh", "old"]);
  });

  it("keeps a completed doc with no upcoming deadline in ready", () => {
    const past = completedWithDeadline("past", -5);
    const { comingUp, ready } = groupVault([past]);
    expect(comingUp).toHaveLength(0);
    expect(ready.map((d) => d.id)).toEqual(["past"]);
  });
});

describe("vaultAttentionReason", () => {
  it("names the failure and its recovery for a failed read", () => {
    const doc = makeDoc({
      id: "x",
      lifecycle: "OCR_FAILED",
      uploadedAt: TODAY,
    });
    expect(vaultAttentionReason(doc)).toMatch(/couldn't read/i);
    expect(vaultAttentionReason(doc)).toMatch(/try again/i);
  });

  it("names the field that needs a check for a correction", () => {
    const analysis = {
      reviewRequirements: [
        { field: "Amount due", reviewStatus: "REQUIRED" },
      ],
    } as unknown as AnalysisResult;
    const doc = makeDoc({
      id: "x",
      lifecycle: "NEEDS_CORRECTION",
      uploadedAt: TODAY,
      analysis,
    });
    expect(vaultAttentionReason(doc)).toContain("amount due");
  });
});

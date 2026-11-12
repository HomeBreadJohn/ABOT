import { describe, expect, it } from "vitest";

import { mockUtilityBillAnalysis, type AnalysisResult } from "@/contracts";
import { applySafetyRules } from "@/features/intelligence/services/safety-rules";

/** Deep clone of the fixture so each test starts from a known-good report. */
function draft(): AnalysisResult {
  return structuredClone(mockUtilityBillAnalysis);
}

describe("applySafetyRules", () => {
  it("downgrades a FOUND finding with no mapped evidence to UNCLEAR", () => {
    const input = draft();
    input.keyInformation[0].informationStatus = "FOUND";
    input.keyInformation[0].evidenceIds = [];

    const { result, adjustments } = applySafetyRules(input);

    expect(result.keyInformation[0].informationStatus).toBe("UNCLEAR");
    expect(adjustments).toContainEqual(
      expect.objectContaining({
        rule: "unsupported-found",
        target: input.keyInformation[0].id,
      }),
    );
  });

  it("downgrades an EXPLICIT consequence without evidence to INFERRED", () => {
    const input = draft();
    const explicit = input.consequences.find((c) => c.kind === "EXPLICIT");
    expect(explicit).toBeDefined();
    explicit!.evidenceIds = [];

    const { result, adjustments } = applySafetyRules(input);

    const after = result.consequences.find((c) => c.id === explicit!.id);
    expect(after?.kind).toBe("INFERRED");
    expect(after?.informationStatus).toBe("INFERRED");
    expect(adjustments).toContainEqual(
      expect.objectContaining({
        rule: "explicit-consequence-without-evidence",
        target: explicit!.id,
      }),
    );
  });

  it("caps a CRITICAL or HIGH watchout without evidence at MEDIUM", () => {
    const input = draft();
    input.watchouts[0].severity = "HIGH";
    input.watchouts[0].evidenceIds = [];

    const { result, adjustments } = applySafetyRules(input);

    expect(result.watchouts[0].severity).toBe("MEDIUM");
    expect(adjustments).toContainEqual(
      expect.objectContaining({
        rule: "unsupported-high-watchout",
        target: input.watchouts[0].id,
      }),
    );
  });

  it("caps an INFERRED finding's severity at MEDIUM", () => {
    const input = draft();
    // A watchout with evidence so rule 3 does not apply; make it INFERRED + CRITICAL.
    input.watchouts[0].severity = "CRITICAL";
    input.watchouts[0].informationStatus = "INFERRED";
    input.watchouts[0].evidenceIds = ["e-3"];

    const { result, adjustments } = applySafetyRules(input);

    expect(result.watchouts[0].severity).toBe("MEDIUM");
    expect(adjustments).toContainEqual(
      expect.objectContaining({
        rule: "inferred-severity-cap",
        target: input.watchouts[0].id,
      }),
    );
  });

  it("neutralizes fraud wording with no CRITICAL evidenced finding", () => {
    const input = draft();
    input.watchouts[0].title = "This looks like a scam";
    input.watchouts[0].explanation = "The bill may be fraud; do not trust it.";

    const { result, adjustments } = applySafetyRules(input);

    expect(result.watchouts[0].title.toLowerCase()).not.toContain("scam");
    expect(result.watchouts[0].explanation.toLowerCase()).not.toContain("fraud");
    expect(result.watchouts[0].explanation.toLowerCase()).toContain("unusual");
    expect(result.watchouts[0].explanation.toLowerCase()).toContain("verify");
    expect(adjustments).toContainEqual(
      expect.objectContaining({
        rule: "unsupported-fraud-claim",
        target: input.watchouts[0].id,
      }),
    );
    expect(result.limitations.some((l) => l.toLowerCase().includes("verify"))).toBe(
      true,
    );
  });

  it("keeps fraud wording when a CRITICAL evidenced finding backs it", () => {
    const input = draft();
    input.watchouts[0].title = "This looks like a scam";
    input.watchouts[0].severity = "CRITICAL";
    input.watchouts[0].evidenceIds = ["e-3"];

    const { result, adjustments } = applySafetyRules(input);

    expect(result.watchouts[0].title.toLowerCase()).toContain("scam");
    expect(
      adjustments.some((a) => a.rule === "unsupported-fraud-claim"),
    ).toBe(false);
  });

  it("removes a finding that claims a completed action", () => {
    const input = draft();
    const target = input.nextSteps[0];
    target.explanation = "I have paid the bill for you.";
    const beforeCount = input.nextSteps.length;

    const { result, adjustments } = applySafetyRules(input);

    expect(result.nextSteps.some((f) => f.id === target.id)).toBe(false);
    expect(result.nextSteps.length).toBe(beforeCount - 1);
    expect(adjustments).toContainEqual(
      expect.objectContaining({
        rule: "claims-completed-action",
        target: target.id,
      }),
    );
  });

  it("downgrades a payment-settled-by-matching-amount claim to INFERRED with a verify step", () => {
    const input = draft();
    const finding = input.keyInformation[0];
    finding.title = "This payment settled the bill";
    finding.explanation =
      "The payment amount matches the bill amount, so the bill is paid.";
    finding.informationStatus = "FOUND";

    const { result, adjustments } = applySafetyRules(input);

    const after = result.keyInformation.find((f) => f.id === finding.id);
    expect(after?.informationStatus).toBe("INFERRED");
    expect(adjustments).toContainEqual(
      expect.objectContaining({
        rule: "payment-match-inference",
        target: finding.id,
      }),
    );
    expect(
      result.nextSteps.some(
        (s) =>
          s.explanation.toLowerCase().includes("verify") ||
          s.title.toLowerCase().includes("verify"),
      ),
    ).toBe(true);
  });

  it("does not mutate the input object", () => {
    const input = draft();
    input.keyInformation[0].informationStatus = "FOUND";
    input.keyInformation[0].evidenceIds = [];
    const snapshot = structuredClone(input);

    applySafetyRules(input);

    expect(input).toEqual(snapshot);
  });
});

import { describe, expect, it } from "vitest";

import { bucketConfidence } from "@/features/documents/report/bucket-confidence";
import {
  averageConfidenceLabel,
  LOW_CONFIDENCE_THRESHOLD,
  summarizeConfidence,
  wordConfidenceCue,
} from "@/features/documents/evidence/confidence-cue";

describe("wordConfidenceCue", () => {
  it("marks words below the threshold as low", () => {
    expect(wordConfidenceCue(0)).toBe("low");
    expect(wordConfidenceCue(LOW_CONFIDENCE_THRESHOLD - 0.01)).toBe("low");
  });

  it("treats the threshold itself and above as ok", () => {
    expect(wordConfidenceCue(LOW_CONFIDENCE_THRESHOLD)).toBe("ok");
    expect(wordConfidenceCue(1)).toBe("ok");
  });

  it("treats null, undefined, and non-finite confidence as unknown, not low", () => {
    expect(wordConfidenceCue(null)).toBe("unknown");
    expect(wordConfidenceCue(undefined)).toBe("unknown");
    expect(wordConfidenceCue(Number.NaN)).toBe("unknown");
  });

  it("agrees with the report's Low bucket across the range", () => {
    for (let i = 0; i <= 100; i += 1) {
      const value = i / 100;
      expect(wordConfidenceCue(value) === "low").toBe(
        bucketConfidence(value) === "Low",
      );
    }
  });
});

describe("summarizeConfidence", () => {
  it("counts low and unknown words separately", () => {
    expect(
      summarizeConfidence([
        { confidence: 0.9 },
        { confidence: 0.2 },
        { confidence: null },
        { confidence: 0.1 },
      ]),
    ).toEqual({ low: 2, unknown: 1, total: 4 });
  });

  it("handles an empty page", () => {
    expect(summarizeConfidence([])).toEqual({ low: 0, unknown: 0, total: 0 });
  });
});

describe("averageConfidenceLabel", () => {
  it("buckets a score and never shows a raw decimal", () => {
    expect(averageConfidenceLabel(0.93)).toBe("High");
    expect(averageConfidenceLabel(0.6)).toBe("Medium");
    expect(averageConfidenceLabel(0.2)).toBe("Low");
  });

  it("reports null as not available", () => {
    expect(averageConfidenceLabel(null)).toBe("Not available");
    expect(averageConfidenceLabel(undefined)).toBe("Not available");
  });
});

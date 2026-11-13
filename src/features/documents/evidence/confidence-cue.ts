import { bucketConfidence } from "@/features/documents/report/bucket-confidence";

/**
 * Per-word OCR confidence cue. The threshold matches the lower edge of the
 * Medium bucket in `bucketConfidence`, so a word is "low" exactly when the
 * report would call that confidence Low. A null confidence is "unknown",
 * never "low" and never "ok".
 */
export const LOW_CONFIDENCE_THRESHOLD = 0.5;

export type WordConfidenceCue = "low" | "ok" | "unknown";

export function wordConfidenceCue(
  confidence: number | null | undefined,
): WordConfidenceCue {
  if (confidence === null || confidence === undefined) return "unknown";
  if (!Number.isFinite(confidence)) return "unknown";
  return confidence < LOW_CONFIDENCE_THRESHOLD ? "low" : "ok";
}

export interface ConfidenceSummary {
  readonly low: number;
  readonly unknown: number;
  readonly total: number;
}

export function summarizeConfidence(
  words: readonly { readonly confidence: number | null }[],
): ConfidenceSummary {
  let low = 0;
  let unknown = 0;
  for (const word of words) {
    const cue = wordConfidenceCue(word.confidence);
    if (cue === "low") low += 1;
    else if (cue === "unknown") unknown += 1;
  }
  return { low, unknown, total: words.length };
}

/** Page-level label for the average confidence. Null means not available. */
export function averageConfidenceLabel(
  average: number | null | undefined,
): string {
  if (average === null || average === undefined || !Number.isFinite(average)) {
    return "Not available";
  }
  return bucketConfidence(average);
}

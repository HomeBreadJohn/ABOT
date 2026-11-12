export type ConfidenceBucket = "Low" | "Medium" | "High";

/** Bucket a 0..1 confidence score so a raw decimal never reaches the UI. */
export function bucketConfidence(confidence: number): ConfidenceBucket {
  if (confidence >= 0.8) {
    return "High";
  }
  if (confidence >= 0.5) {
    return "Medium";
  }
  return "Low";
}

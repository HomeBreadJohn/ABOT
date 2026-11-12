import { describe, expect, it } from "vitest";

import { bucketConfidence } from "@/features/documents/report/bucket-confidence";

describe("bucketConfidence", () => {
  it("buckets a low score as Low", () => {
    expect(bucketConfidence(0.2)).toBe("Low");
  });

  it("buckets a mid score as Medium", () => {
    expect(bucketConfidence(0.6)).toBe("Medium");
  });

  it("buckets a high score as High", () => {
    expect(bucketConfidence(0.9)).toBe("High");
  });

  it("treats the 0.5 boundary as Medium", () => {
    expect(bucketConfidence(0.5)).toBe("Medium");
  });

  it("treats the 0.8 boundary as High", () => {
    expect(bucketConfidence(0.8)).toBe("High");
  });
});

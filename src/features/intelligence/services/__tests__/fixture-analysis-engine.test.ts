import { describe, expect, it } from "vitest";

import { parseAnalysisResult } from "@/contracts";
import { FixtureAnalysisEngine } from "@/features/intelligence/services/fixture-analysis-engine";

describe("FixtureAnalysisEngine", () => {
  it("rewrites the fixture with the real documentId everywhere and passes validation", async () => {
    const engine = new FixtureAnalysisEngine();

    const { result, outcome } = await engine.analyze({
      documentId: "real-doc-123",
      pages: [],
      corrections: [],
      language: "EN",
    });

    expect(outcome).toBe("COMPLETED");
    expect(result.document.documentId).toBe("real-doc-123");
    for (const evidence of result.evidence) {
      expect(evidence.documentId).toBe("real-doc-123");
    }
    // parseAnalysisResult rejects any evidence with a mismatched documentId.
    expect(() =>
      parseAnalysisResult(result, { documentId: "real-doc-123" }),
    ).not.toThrow();
  });
});

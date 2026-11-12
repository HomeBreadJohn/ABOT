import { describe, expect, it } from "vitest";
import {
  ANALYSIS_SCHEMA_VERSION,
  parseAnalysisResult,
  analysisResultSchema,
  type AnalysisResult,
} from "@/contracts/analysis";
import {
  mockNeedsCorrectionAnalysis,
  mockPartialAnalysis,
  mockUtilityBillAnalysis,
} from "@/contracts/mock-analysis";
import { ContractError } from "@/contracts/errors";

const DOC_ID = "mock-doc-1";

/** Base valid result; tests mutate one field at a time. */
const base = (): AnalysisResult =>
  analysisResultSchema.parse(
    JSON.parse(JSON.stringify(mockUtilityBillAnalysis)),
  );

const build = (mutate: (value: Record<string, unknown>) => void): unknown => {
  const value = JSON.parse(JSON.stringify(mockUtilityBillAnalysis)) as Record<
    string,
    unknown
  >;
  mutate(value);
  return value;
};

describe("ANALYSIS_SCHEMA_VERSION", () => {
  it("is 1.0.0", () => {
    expect(ANALYSIS_SCHEMA_VERSION).toBe("1.0.0");
  });
});

describe("analysisResultSchema", () => {
  it("rejects when any top-level field from product.md section 15 is missing", () => {
    const TOP_LEVEL = [
      "schemaVersion",
      "document",
      "overview",
      "explanation",
      "keyInformation",
      "obligations",
      "watchouts",
      "consequences",
      "nextSteps",
      "importantDates",
      "specializedSections",
      "evidence",
      "limitations",
      "reviewRequirements",
      "analysisMetadata",
    ];
    for (const field of TOP_LEVEL) {
      const value = build((v) => {
        delete v[field];
      });
      expect(analysisResultSchema.safeParse(value).success).toBe(false);
    }
  });

  it("accepts FOUND with low confidence and keeps the status", () => {
    const value = build((v) => {
      (v.keyInformation as Record<string, unknown>[])[0].confidence = 0.2;
    });
    const parsed = analysisResultSchema.parse(value);
    expect(parsed.keyInformation[0].informationStatus).toBe("FOUND");
  });

  it("accepts INFERRED with high confidence and keeps the status", () => {
    const value = build((v) => {
      (v.consequences as Record<string, unknown>[])[1].confidence = 0.9;
    });
    const parsed = analysisResultSchema.parse(value);
    expect(parsed.consequences[1].informationStatus).toBe("INFERRED");
  });

  it("rejects confidence outside 0-1", () => {
    for (const confidence of [-0.1, 1.1]) {
      const value = build((v) => {
        (v.keyInformation as Record<string, unknown>[])[0].confidence =
          confidence;
      });
      expect(analysisResultSchema.safeParse(value).success).toBe(false);
    }
  });

  it("rejects an EXPLICIT consequence with INFERRED status", () => {
    const value = build((v) => {
      (v.consequences as Record<string, unknown>[])[0].informationStatus =
        "INFERRED";
    });
    expect(analysisResultSchema.safeParse(value).success).toBe(false);
  });

  it("rejects unavailablePages without partial", () => {
    const value = build((v) => {
      (v.analysisMetadata as Record<string, unknown>).partial = false;
      (v.analysisMetadata as Record<string, unknown>).unavailablePages = [3];
    });
    expect(analysisResultSchema.safeParse(value).success).toBe(false);
  });

  it("validates optional evidence word ranges and match confidence", () => {
    const value = build((v) => {
      const evidence = v.evidence as Record<string, unknown>[];
      evidence[0].wordStart = 4;
      evidence[0].wordEnd = 3;
    });
    expect(analysisResultSchema.safeParse(value).success).toBe(false);

    const negative = build((v) => {
      const evidence = v.evidence as Record<string, unknown>[];
      evidence[0].wordStart = -1;
      evidence[0].wordEnd = 2;
    });
    expect(analysisResultSchema.safeParse(negative).success).toBe(false);

    const confidence = build((v) => {
      const evidence = v.evidence as Record<string, unknown>[];
      evidence[0].matchConfidence = 1.5;
    });
    expect(analysisResultSchema.safeParse(confidence).success).toBe(false);
  });
});

describe("parseAnalysisResult", () => {
  it("parses a valid result", () => {
    const result = parseAnalysisResult(mockUtilityBillAnalysis, {
      documentId: DOC_ID,
    });
    expect(result.document.documentId).toBe(DOC_ID);
  });

  it("rejects duplicate evidence IDs", () => {
    const value = build((v) => {
      const evidence = v.evidence as Record<string, unknown>[];
      evidence[1].id = evidence[0].id;
    });
    expect(() => parseAnalysisResult(value, { documentId: DOC_ID })).toThrow(
      ContractError,
    );
  });

  it("rejects evidence from a different document", () => {
    const value = build((v) => {
      const evidence = v.evidence as Record<string, unknown>[];
      evidence[0].documentId = "other-doc";
    });
    expect(() => parseAnalysisResult(value, { documentId: DOC_ID })).toThrow(
      ContractError,
    );
  });

  it("rejects an evidenceIds entry with no matching evidence, naming the finding", () => {
    const value = build((v) => {
      const findings = v.obligations as Record<string, unknown>[];
      findings[0].evidenceIds = ["e-missing"];
    });
    try {
      parseAnalysisResult(value, { documentId: DOC_ID });
      expect.unreachable("expected ContractError");
    } catch (error) {
      expect(error).toBeInstanceOf(ContractError);
      expect((error as ContractError).reason).toContain("f-pay");
    }
  });

  it("rejects a CRITICAL watchout with no evidence", () => {
    const value = build((v) => {
      const watchout = (v.watchouts as Record<string, unknown>[])[0];
      watchout.severity = "CRITICAL";
      watchout.evidenceIds = [];
    });
    expect(() => parseAnalysisResult(value, { documentId: DOC_ID })).toThrow(
      ContractError,
    );
  });
});

describe("fixtures", () => {
  it("all three pass parseAnalysisResult", () => {
    for (const fixture of [
      mockUtilityBillAnalysis,
      mockPartialAnalysis,
      mockNeedsCorrectionAnalysis,
    ]) {
      const result = parseAnalysisResult(fixture, { documentId: DOC_ID });
      expect(result.schemaVersion).toBe("1.0.0");
    }
  });

  it("mockPartialAnalysis has page 2 unavailable with a limitation naming it", () => {
    expect(mockPartialAnalysis.analysisMetadata.partial).toBe(true);
    expect(mockPartialAnalysis.analysisMetadata.unavailablePages).toEqual([2]);
    expect(mockPartialAnalysis.limitations.join(" ")).toContain("2");
  });

  it("mockNeedsCorrectionAnalysis links a REQUIRED review item to the low-confidence amount finding", () => {
    const finding = mockNeedsCorrectionAnalysis.keyInformation[0];
    expect(finding.confidence).toBeLessThan(0.6);
    const required = mockNeedsCorrectionAnalysis.reviewRequirements.filter(
      (r) => r.reviewStatus === "REQUIRED",
    );
    expect(required).toHaveLength(1);
    expect(required[0].findingId).toBe(finding.id);
  });
});

describe("base fixture is untouched by mutation helper", () => {
  it("base() parses", () => {
    expect(base().schemaVersion).toBe(ANALYSIS_SCHEMA_VERSION);
  });
});

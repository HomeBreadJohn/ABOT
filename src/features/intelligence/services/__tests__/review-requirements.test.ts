import { describe, expect, it } from "vitest";

import type { AnalysisResult } from "@/contracts";
import type { EvidencePage } from "@/features/intelligence/services/evidence-mapping";
import {
  decideOutcome,
  deriveReviewRequirements,
} from "@/features/intelligence/services/review-requirements";

const DOCUMENT_ID = "doc-1";

/** A one-page OCR fixture whose word confidences the caller supplies. */
function page(confidences: (number | null)[]): EvidencePage {
  return {
    pageNumber: 1,
    text: confidences.map((_, i) => `w${i}`).join(" "),
    words: confidences.map((confidence, index) => ({
      index,
      text: `w${index}`,
      confidence,
    })),
  };
}

/** A minimal valid-shaped AnalysisResult we can bend per test. */
function baseResult(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    schemaVersion: "1.0.0",
    document: {
      documentId: DOCUMENT_ID,
      documentType: "UTILITIES",
      documentSubtype: null,
      issuer: null,
      classificationConfidence: 0.95,
    },
    overview: "o",
    explanation: "e",
    keyInformation: [],
    obligations: [],
    watchouts: [],
    consequences: [],
    nextSteps: [],
    importantDates: [],
    specializedSections: [],
    evidence: [],
    limitations: [],
    reviewRequirements: [],
    analysisMetadata: {
      modelInstanceId: null,
      generatedAt: "2026-01-01T00:00:00.000Z",
      analysisVersion: 1,
      language: "EN",
      categoryModules: [],
      partial: false,
      unavailablePages: [],
    },
    ...overrides,
  };
}

describe("deriveReviewRequirements", () => {
  it("flags a money-amount finding whose evidence words average below 0.85 as REQUIRED/CRITICAL", () => {
    const result = baseResult({
      keyInformation: [
        {
          id: "f-amount",
          title: "Amount due",
          explanation: "PHP 2,450.00 is due.",
          informationStatus: "FOUND",
          confidence: 0.9,
          basis: "Billing summary.",
          evidenceIds: ["e-1"],
        },
      ],
      evidence: [
        {
          id: "e-1",
          documentId: DOCUMENT_ID,
          pageNumber: 1,
          wordStart: 0,
          wordEnd: 1,
          matchConfidence: 0.8,
          excerpt: "Amount Due",
          sourceType: "OCR_TEXT",
        },
      ],
    });
    // Words 0 and 1 average (0.7 + 0.8) / 2 = 0.75 < 0.85.
    const reqs = deriveReviewRequirements(result, [page([0.7, 0.8])]);

    expect(reqs).toHaveLength(1);
    expect(reqs[0].reviewStatus).toBe("REQUIRED");
    expect(reqs[0].impactLevel).toBe("CRITICAL");
    expect(reqs[0].findingId).toBe("f-amount");
    expect(reqs[0].evidenceId).toBe("e-1");
    expect(reqs[0].pageNumber).toBe(1);
  });

  it("flags a deadline finding (importantDates) with low-confidence evidence", () => {
    const result = baseResult({
      importantDates: [
        {
          id: "d-due",
          title: "Payment due date",
          explanation: "Due date shown.",
          informationStatus: "FOUND",
          confidence: 0.95,
          basis: "On the bill.",
          evidenceIds: ["e-2"],
          date: null,
          dateText: "December 15",
        },
      ],
      evidence: [
        {
          id: "e-2",
          documentId: DOCUMENT_ID,
          pageNumber: 1,
          wordStart: 0,
          wordEnd: 0,
          matchConfidence: 0.6,
          excerpt: "Due",
          sourceType: "OCR_TEXT",
        },
      ],
    });
    const reqs = deriveReviewRequirements(result, [page([0.5])]);

    expect(reqs).toHaveLength(1);
    expect(reqs[0].reviewStatus).toBe("REQUIRED");
    expect(reqs[0].impactLevel).toBe("CRITICAL");
  });

  it("does NOT flag a critical-field finding whose evidence words average at or above 0.85", () => {
    const result = baseResult({
      keyInformation: [
        {
          id: "f-amount",
          title: "Total amount payable",
          explanation: "PHP 2,450.00.",
          informationStatus: "FOUND",
          confidence: 0.9,
          basis: "Billing summary.",
          evidenceIds: ["e-1"],
        },
      ],
      evidence: [
        {
          id: "e-1",
          documentId: DOCUMENT_ID,
          pageNumber: 1,
          wordStart: 0,
          wordEnd: 1,
          matchConfidence: 0.95,
          excerpt: "Amount Due",
          sourceType: "OCR_TEXT",
        },
      ],
    });
    const reqs = deriveReviewRequirements(result, [page([0.9, 0.95])]);
    expect(reqs).toHaveLength(0);
  });

  it("treats OCR confidence not measured (null) on a critical field as a REASON TO FLAG, not high confidence", () => {
    const result = baseResult({
      obligations: [
        {
          id: "f-penalty",
          title: "Late payment penalty",
          explanation: "A penalty applies after the due date.",
          informationStatus: "FOUND",
          confidence: 0.9,
          basis: "Printed note.",
          evidenceIds: ["e-1"],
        },
      ],
      evidence: [
        {
          id: "e-1",
          documentId: DOCUMENT_ID,
          pageNumber: 1,
          wordStart: 0,
          wordEnd: 1,
          matchConfidence: 1,
          excerpt: "penalty applies",
          sourceType: "OCR_TEXT",
        },
      ],
    });
    // All words have unmeasured (null) confidence.
    const reqs = deriveReviewRequirements(result, [page([null, null])]);

    expect(reqs).toHaveLength(1);
    expect(reqs[0].reviewStatus).toBe("REQUIRED");
    expect(reqs[0].impactLevel).toBe("CRITICAL");
  });

  it("adds an OPTIONAL requirement for any other finding with confidence below 0.6", () => {
    const result = baseResult({
      keyInformation: [
        {
          id: "f-note",
          title: "Account note",
          explanation: "A general note on the account.",
          informationStatus: "INFERRED",
          confidence: 0.4,
          basis: "Inferred from context.",
          evidenceIds: [],
        },
      ],
    });
    const reqs = deriveReviewRequirements(result, [page([0.95])]);

    expect(reqs).toHaveLength(1);
    expect(reqs[0].reviewStatus).toBe("OPTIONAL");
    expect(reqs[0].findingId).toBe("f-note");
  });

  it("adds an OPTIONAL requirement for the category field when classification is ambiguous", () => {
    const result = baseResult({
      document: {
        documentId: DOCUMENT_ID,
        documentType: "OTHER",
        documentSubtype: null,
        issuer: null,
        classificationConfidence: 0.4,
      },
    });
    const reqs = deriveReviewRequirements(result, []);

    expect(reqs).toHaveLength(1);
    expect(reqs[0].reviewStatus).toBe("OPTIONAL");
    expect(reqs[0].field).toBe("category");
  });

  it("does not duplicate a REQUIRED critical flag as an OPTIONAL low-confidence flag", () => {
    // A critical-field finding BOTH has low-confidence evidence AND finding
    // confidence < 0.6: it should produce exactly one REQUIRED item.
    const result = baseResult({
      keyInformation: [
        {
          id: "f-amount",
          title: "Amount due",
          explanation: "PHP 2,450.00.",
          informationStatus: "UNCLEAR",
          confidence: 0.45,
          basis: "Smudged.",
          evidenceIds: ["e-1"],
        },
      ],
      evidence: [
        {
          id: "e-1",
          documentId: DOCUMENT_ID,
          pageNumber: 1,
          wordStart: 0,
          wordEnd: 0,
          matchConfidence: 0.4,
          excerpt: "2,450.00",
          sourceType: "OCR_TEXT",
        },
      ],
    });
    const reqs = deriveReviewRequirements(result, [page([0.4])]);

    expect(reqs).toHaveLength(1);
    expect(reqs[0].reviewStatus).toBe("REQUIRED");
  });
});

describe("decideOutcome", () => {
  it("returns NEEDS_CORRECTION when any unresolved REQUIRED item exists", () => {
    const result = baseResult({
      reviewRequirements: [
        {
          id: "r-1",
          field: "Amount due",
          reason: "Low OCR confidence.",
          impact: "Wrong amount.",
          impactLevel: "CRITICAL",
          pageNumber: 1,
          reviewStatus: "REQUIRED",
        },
        {
          id: "r-2",
          field: "Note",
          reason: "Low confidence.",
          impact: "Minor.",
          impactLevel: "LOW",
          pageNumber: 1,
          reviewStatus: "OPTIONAL",
        },
      ],
    });
    expect(decideOutcome(result)).toBe("NEEDS_CORRECTION");
  });

  it("returns REVIEW_REQUIRED when only OPTIONAL items exist", () => {
    const result = baseResult({
      reviewRequirements: [
        {
          id: "r-2",
          field: "Note",
          reason: "Low confidence.",
          impact: "Minor.",
          impactLevel: "LOW",
          pageNumber: 1,
          reviewStatus: "OPTIONAL",
        },
      ],
    });
    expect(decideOutcome(result)).toBe("REVIEW_REQUIRED");
  });

  it("returns COMPLETED when there are no outstanding items", () => {
    const result = baseResult({
      reviewRequirements: [
        {
          id: "r-3",
          field: "Amount due",
          reason: "Was low confidence.",
          impact: "Resolved.",
          impactLevel: "CRITICAL",
          pageNumber: 1,
          reviewStatus: "RESOLVED",
        },
      ],
    });
    expect(decideOutcome(result)).toBe("COMPLETED");
  });
});

/**
 * PLACEHOLDER (Person 2). Mock for Person 1's report UI.
 * Fictional data only. Exercises FOUND, INFERRED, EXPLICIT/INFERRED consequences,
 * a required review item, and evidence links.
 */
import {
  ANALYSIS_SCHEMA_VERSION,
  analysisResultSchema,
  type AnalysisResult,
} from "@/contracts/analysis";

export const mockUtilityBillAnalysis: AnalysisResult =
  analysisResultSchema.parse({
    schemaVersion: ANALYSIS_SCHEMA_VERSION,
    document: {
      documentType: "UTILITIES",
      documentSubtype: "Electric bill",
      issuer: "Sample Electric Cooperative",
      classificationConfidence: 0.93,
    },
    overview: "This is a monthly electric bill with a payment due date.",
    explanation: "Ito ang singil sa kuryente mo para sa buwang ito.",
    keyInformation: [
      {
        id: "f-amount",
        title: "Amount due",
        explanation: "The bill states PHP 2,450.00 is due.",
        informationStatus: "FOUND",
        confidence: 0.82,
        basis: "Stated in the billing summary.",
        evidenceIds: ["e-1"],
      },
    ],
    obligations: [
      {
        id: "f-pay",
        title: "Pay before the due date",
        explanation: "Payment is expected by the due date shown.",
        informationStatus: "FOUND",
        confidence: 0.9,
        basis: "Stated on the bill.",
        evidenceIds: ["e-2"],
      },
    ],
    watchouts: [
      {
        id: "w-late",
        title: "Late payment charge",
        explanation: "A surcharge may apply if payment is late.",
        severity: "MEDIUM",
        informationStatus: "FOUND",
        confidence: 0.88,
        basis: "Penalty note printed on the bill.",
        evidenceIds: ["e-3"],
      },
    ],
    consequences: [
      {
        id: "c-1",
        kind: "EXPLICIT",
        title: "Surcharge on late payment",
        explanation: "The bill says a surcharge applies after the due date.",
        informationStatus: "FOUND",
        confidence: 0.88,
        basis: "Printed penalty note.",
        evidenceIds: ["e-3"],
      },
      {
        id: "c-2",
        kind: "INFERRED",
        title: "Possible disconnection if unpaid",
        explanation:
          "Not stated here. Ask the provider about disconnection rules.",
        informationStatus: "INFERRED",
        confidence: 0.4,
        basis: "Common utility practice, not in this document.",
        evidenceIds: [],
      },
    ],
    nextSteps: [
      {
        id: "n-1",
        title: "Confirm the amount before paying",
        explanation:
          "The amount has low OCR confidence. Check it against the original.",
        informationStatus: "FOUND",
        confidence: 0.8,
        basis: "Review requirement for the amount field.",
        evidenceIds: ["e-1"],
      },
    ],
    importantDates: [
      {
        id: "d-due",
        title: "Payment due date",
        explanation: "Payment is due on this date.",
        informationStatus: "FOUND",
        confidence: 0.9,
        basis: "Stated on the bill.",
        evidenceIds: ["e-2"],
        date: "2026-12-15",
        dateText: "December 15, 2026",
      },
    ],
    specializedSections: [
      {
        id: "billing-breakdown",
        title: "Billing breakdown",
        items: [
          {
            id: "b-1",
            title: "Consumption",
            explanation: "250 kWh used this period.",
            informationStatus: "FOUND",
            confidence: 0.85,
            basis: "Meter reading table.",
            evidenceIds: ["e-4"],
          },
        ],
      },
    ],
    evidence: [
      {
        id: "e-1",
        documentId: "mock-doc-1",
        pageNumber: 1,
        excerpt: "Amount Due: PHP 2,450.00",
        sourceType: "OCR_TEXT",
      },
      {
        id: "e-2",
        documentId: "mock-doc-1",
        pageNumber: 1,
        excerpt: "Due Date: December 15, 2026",
        sourceType: "OCR_TEXT",
      },
      {
        id: "e-3",
        documentId: "mock-doc-1",
        pageNumber: 2,
        excerpt: "A surcharge applies to payments after the due date.",
        sourceType: "OCR_TEXT",
      },
      {
        id: "e-4",
        documentId: "mock-doc-1",
        pageNumber: 1,
        excerpt: "Consumption: 250 kWh",
        sourceType: "OCR_TEXT",
      },
    ],
    limitations: ["Disconnection terms are not in this document."],
    reviewRequirements: [
      {
        field: "Amount due",
        reason: "Low OCR confidence on a payment amount.",
        impact: "Wrong amount could cause under- or overpayment.",
        pageNumber: 1,
        reviewStatus: "REQUIRED",
      },
    ],
    analysisMetadata: {
      modelInstanceId: null,
      generatedAt: "2026-01-01T00:00:00.000Z",
      partial: false,
      unavailablePages: [],
    },
  });

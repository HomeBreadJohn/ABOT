/**
 * Mock fixtures for Person 1's report UI and pipeline tests.
 * Fictional data only; nothing here claims to come from Lumen.
 * - mockUtilityBillAnalysis: clean bill, FOUND/INFERRED mix, explicit consequence.
 * - mockPartialAnalysis: page 2 unavailable, disclosed as a limitation.
 * - mockNeedsCorrectionAnalysis: low-confidence amount with a REQUIRED review item.
 */
import {
  ANALYSIS_SCHEMA_VERSION,
  analysisResultSchema,
  type AnalysisResult,
} from "@/contracts/analysis";

const DOCUMENT_ID = "mock-doc-1";

export const mockUtilityBillAnalysis: AnalysisResult =
  analysisResultSchema.parse({
    schemaVersion: ANALYSIS_SCHEMA_VERSION,
    document: {
      documentId: DOCUMENT_ID,
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
        documentId: DOCUMENT_ID,
        pageNumber: 1,
        wordStart: 0,
        wordEnd: 4,
        matchConfidence: 1,
        excerpt: "Amount Due: PHP 2,450.00",
        sourceType: "OCR_TEXT",
      },
      {
        id: "e-2",
        documentId: DOCUMENT_ID,
        pageNumber: 1,
        wordStart: 5,
        wordEnd: 8,
        matchConfidence: 1,
        excerpt: "Due Date: December 15, 2026",
        sourceType: "OCR_TEXT",
      },
      {
        id: "e-3",
        documentId: DOCUMENT_ID,
        pageNumber: 2,
        excerpt: "A surcharge applies to payments after the due date.",
        sourceType: "OCR_TEXT",
      },
      {
        id: "e-4",
        documentId: DOCUMENT_ID,
        pageNumber: 1,
        excerpt: "Consumption: 250 kWh",
        sourceType: "OCR_TEXT",
      },
    ],
    limitations: ["Disconnection terms are not in this document."],
    reviewRequirements: [
      {
        id: "r-1",
        field: "Amount due",
        reason: "Low OCR confidence on a payment amount.",
        impact: "Wrong amount could cause under- or overpayment.",
        impactLevel: "HIGH",
        pageNumber: 1,
        reviewStatus: "REQUIRED",
        findingId: "f-amount",
        evidenceId: "e-1",
      },
    ],
    analysisMetadata: {
      modelInstanceId: null,
      generatedAt: "2026-01-01T00:00:00.000Z",
      analysisVersion: 1,
      language: "EN",
      categoryModules: ["billing-breakdown"],
      partial: false,
      unavailablePages: [],
    },
  });

export const mockPartialAnalysis: AnalysisResult = analysisResultSchema.parse({
  schemaVersion: ANALYSIS_SCHEMA_VERSION,
  document: {
    documentId: DOCUMENT_ID,
    documentType: "FINANCIAL",
    documentSubtype: "Loan statement",
    issuer: "Sample Lending Corporation",
    classificationConfidence: 0.87,
  },
  overview:
    "A quarterly loan statement processed without its second page, which could not be read.",
  explanation: "Kulang ang pahina 2, kaya hindi nito mabasa ang rate details.",
  keyInformation: [
    {
      id: "p-balance",
      title: "Outstanding balance",
      explanation:
        "The statement shows an outstanding balance of PHP 18,200.00.",
      informationStatus: "FOUND",
      confidence: 0.86,
      basis: "Stated in the summary box.",
      evidenceIds: ["p-e-1"],
    },
  ],
  obligations: [],
  watchouts: [],
  consequences: [],
  nextSteps: [
    {
      id: "p-n-1",
      title: "Check page 2 for the interest rate",
      explanation:
        "Page 2 could not be read, so the interest rate section is missing.",
      informationStatus: "FOUND",
      confidence: 0.7,
      basis: "Page 2 is unavailable.",
      evidenceIds: [],
    },
  ],
  importantDates: [],
  specializedSections: [],
  evidence: [
    {
      id: "p-e-1",
      documentId: DOCUMENT_ID,
      pageNumber: 1,
      excerpt: "Outstanding Balance: PHP 18,200.00",
      sourceType: "OCR_TEXT",
    },
  ],
  limitations: [
    "Page 2 could not be processed, so any information on it is missing from this report.",
  ],
  reviewRequirements: [],
  analysisMetadata: {
    modelInstanceId: null,
    generatedAt: "2026-01-02T00:00:00.000Z",
    analysisVersion: 1,
    language: "EN",
    categoryModules: ["interest-and-fees"],
    partial: true,
    unavailablePages: [2],
  },
});

export const mockNeedsCorrectionAnalysis: AnalysisResult =
  analysisResultSchema.parse({
    schemaVersion: ANALYSIS_SCHEMA_VERSION,
    document: {
      documentId: DOCUMENT_ID,
      documentType: "UTILITIES",
      documentSubtype: "Water bill",
      issuer: "Sample Water District",
      classificationConfidence: 0.9,
    },
    overview:
      "A water bill whose amount is hard to read, so it needs a correction before use.",
    explanation:
      "Mahirap mabasa ang halaga, kailangan itong i-check sa orihinal na resibo.",
    keyInformation: [
      {
        id: "nc-amount",
        title: "Amount due",
        explanation: "The bill appears to state PHP 741.85 is due.",
        informationStatus: "UNCLEAR",
        confidence: 0.45,
        basis: "Amount region is smudged in the OCR text.",
        evidenceIds: ["nc-e-1"],
      },
    ],
    obligations: [
      {
        id: "nc-pay",
        title: "Pay before the due date",
        explanation: "Payment is expected by the due date shown.",
        informationStatus: "FOUND",
        confidence: 0.88,
        basis: "Stated under the billing summary.",
        evidenceIds: ["nc-e-2"],
      },
    ],
    watchouts: [
      {
        id: "nc-w-1",
        title: "Amount could be wrong",
        explanation:
          "The amount is not reliably readable, so verify before paying.",
        severity: "MEDIUM",
        informationStatus: "UNCLEAR",
        confidence: 0.45,
        basis: "Low OCR confidence on the amount.",
        evidenceIds: ["nc-e-1"],
      },
    ],
    consequences: [],
    nextSteps: [
      {
        id: "nc-n-1",
        title: "Correct the amount",
        explanation:
          "Compare the amount against the original bill and correct it if needed.",
        informationStatus: "FOUND",
        confidence: 0.7,
        basis: "Review requirement for the amount field.",
        evidenceIds: [],
      },
    ],
    importantDates: [
      {
        id: "nc-d-1",
        title: "Payment due date",
        explanation: "Payment is due on this date.",
        informationStatus: "FOUND",
        confidence: 0.88,
        basis: "Stated under the billing summary.",
        evidenceIds: ["nc-e-2"],
        date: "2026-11-30",
        dateText: "November 30, 2026",
      },
    ],
    specializedSections: [],
    evidence: [
      {
        id: "nc-e-1",
        documentId: DOCUMENT_ID,
        pageNumber: 1,
        excerpt: "Total Am0unt Due: PHP 741.85",
        sourceType: "OCR_TEXT",
        matchConfidence: 0.4,
      },
      {
        id: "nc-e-2",
        documentId: DOCUMENT_ID,
        pageNumber: 1,
        excerpt: "Due Date: November 30, 2026",
        sourceType: "OCR_TEXT",
        matchConfidence: 0.95,
      },
    ],
    limitations: [
      "The amount could not be read with high confidence; confirm before relying on it.",
    ],
    reviewRequirements: [
      {
        id: "nc-r-1",
        field: "Amount due",
        reason: "The amount has low OCR confidence on a payment field.",
        impact: "Paying a wrong amount could leave the bill unpaid.",
        impactLevel: "CRITICAL",
        pageNumber: 1,
        reviewStatus: "REQUIRED",
        findingId: "nc-amount",
        evidenceId: "nc-e-1",
      },
    ],
    analysisMetadata: {
      modelInstanceId: null,
      generatedAt: "2026-01-03T00:00:00.000Z",
      analysisVersion: 1,
      language: "EN",
      categoryModules: ["billing-breakdown"],
      partial: false,
      unavailablePages: [],
    },
  });

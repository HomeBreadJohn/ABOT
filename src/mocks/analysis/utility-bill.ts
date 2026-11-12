import { ANALYSIS_SCHEMA_VERSION, type AnalysisResult } from "@/contracts";

import { MOCK_DOCUMENT_IDS } from "../ids";

const documentId = MOCK_DOCUMENT_IDS.utilityBill;

/**
 * Utilities category. Exercises: low OCR confidence on a critical amount,
 * REQUIRED review, conditional-language severity, billing breakdown section.
 */
export const utilityBillAnalysis: AnalysisResult = {
  schemaVersion: ANALYSIS_SCHEMA_VERSION,
  document: {
    documentType: "UTILITIES",
    documentSubtype: "Electricity bill",
    issuer: "Lakeview Electric Cooperative (fictional)",
    classificationConfidence: 0.98,
  },
  overview:
    "This is an electricity bill for October 2026. The amount due is due on November 20, 2026. The total amount was printed unclearly, so please confirm it before you pay.",
  explanation:
    "The cooperative is charging you for 312 kWh of electricity used between October 1 and October 31, 2026. If the bill is not paid by the due date, a 2% monthly surcharge applies. The notice also says service may be disconnected after a due-date notice, but it does not say when.",
  keyInformation: [
    {
      id: "ki-1",
      title: "Provider",
      explanation: "The company that issued this bill.",
      informationStatus: "FOUND",
      confidence: 0.98,
      basis: null,
      evidenceIds: ["ev-1"],
      value: "Lakeview Electric Cooperative",
    },
    {
      id: "ki-2",
      title: "Account number",
      explanation: "Use this number when you pay or contact the provider.",
      informationStatus: "FOUND",
      confidence: 0.9,
      basis: null,
      evidenceIds: ["ev-1"],
      value: "0012-3456-7",
    },
    {
      id: "ki-3",
      title: "Total amount due",
      explanation:
        "The amount you need to pay. The digits were hard to read, so please check it against your paper bill.",
      informationStatus: "FOUND",
      confidence: 0.58,
      basis: "Present in the document, but OCR confidence is low.",
      evidenceIds: ["ev-2"],
      value: "PHP 3,482.50",
    },
    {
      id: "ki-4",
      title: "Customer name",
      explanation: "The name area is smudged, so we cannot read it reliably.",
      informationStatus: "UNCLEAR",
      confidence: 0.2,
      basis: "The text exists but is not legible.",
      evidenceIds: [],
      value: null,
    },
  ],
  obligations: [
    {
      id: "ob-1",
      title: "Pay the bill by the due date",
      explanation: "Payment is due on November 20, 2026.",
      informationStatus: "FOUND",
      confidence: 0.95,
      basis: null,
      evidenceIds: ["ev-3"],
      dueDate: "2026-11-20",
    },
  ],
  watchouts: [
    {
      id: "wo-1",
      title: "Payment deadline: November 20, 2026",
      explanation: "Paying after this date adds a surcharge.",
      informationStatus: "FOUND",
      confidence: 0.95,
      basis: "Stated directly on the bill.",
      evidenceIds: ["ev-3"],
      severity: "HIGH",
      watchoutType: "DEADLINE",
    },
    {
      id: "wo-2",
      title: "2% monthly surcharge on late payment",
      explanation:
        "Overdue balances get a 2% charge for each month they remain unpaid.",
      informationStatus: "FOUND",
      confidence: 0.93,
      basis: null,
      evidenceIds: ["ev-4"],
      severity: "MEDIUM",
      watchoutType: "PENALTY",
    },
    {
      id: "wo-3",
      title: "Possible service disconnection",
      explanation:
        "The bill says service may be disconnected after a due-date notice. The wording is conditional and gives no date.",
      informationStatus: "FOUND",
      confidence: 0.9,
      basis:
        "Rated MEDIUM because the wording is conditional ('may') and tied to a later notice, even though disconnection sounds serious.",
      evidenceIds: ["ev-4"],
      severity: "MEDIUM",
      watchoutType: "UNUSUAL_CONDITION",
    },
  ],
  consequences: [
    {
      id: "co-1",
      title: "A 2% surcharge applies each month",
      explanation: "This is stated on the bill.",
      informationStatus: "FOUND",
      confidence: 0.93,
      basis: null,
      evidenceIds: ["ev-4"],
      consequenceType: "EXPLICIT",
    },
    {
      id: "co-2",
      title: "Service may be disconnected",
      explanation:
        "The bill says this may happen after a due-date notice. It does not say when.",
      informationStatus: "FOUND",
      confidence: 0.9,
      basis: null,
      evidenceIds: ["ev-4"],
      consequenceType: "EXPLICIT",
    },
  ],
  nextSteps: [
    {
      id: "ns-1",
      title: "Confirm the total amount before paying",
      explanation:
        "Compare the amount on this scan with your paper bill or the provider's official channel.",
      informationStatus: "FOUND",
      confidence: null,
      basis: "Suggested because OCR confidence is low for the amount.",
      evidenceIds: ["ev-2"],
      stepType: "VERIFY",
    },
    {
      id: "ns-2",
      title: "Pay before November 20, 2026",
      explanation:
        "Use the provider's official payment options. Kalinga cannot make payments for you.",
      informationStatus: "FOUND",
      confidence: null,
      basis: null,
      evidenceIds: ["ev-3"],
      stepType: "ACTION",
    },
    {
      id: "ns-3",
      title: "Ask about payment arrangements if you cannot pay on time",
      explanation:
        "Contact the cooperative and ask whether extensions or installments are available.",
      informationStatus: "FOUND",
      confidence: null,
      basis: null,
      evidenceIds: ["ev-4"],
      stepType: "ASK",
    },
  ],
  importantDates: [
    {
      id: "dt-1",
      title: "Payment due date",
      explanation: "Pay on or before this date to avoid the surcharge.",
      informationStatus: "FOUND",
      confidence: 0.95,
      basis: null,
      evidenceIds: ["ev-3"],
      date: "2026-11-20",
      dateType: "DEADLINE",
    },
    {
      id: "dt-2",
      title: "End of billing period",
      explanation: "The bill covers electricity used up to this date.",
      informationStatus: "FOUND",
      confidence: 0.92,
      basis: null,
      evidenceIds: ["ev-1"],
      date: "2026-10-31",
      dateType: "OTHER",
    },
  ],
  specializedSections: [
    {
      id: "sec-bill",
      sectionKey: "billing_breakdown",
      title: "Billing breakdown",
      summary: "How the amount was calculated, as far as the bill shows.",
      items: [
        {
          id: "sc-1",
          title: "Electricity used",
          explanation:
            "Difference between present and previous meter readings.",
          informationStatus: "FOUND",
          confidence: 0.9,
          basis: null,
          evidenceIds: ["ev-5"],
          value: "312 kWh",
          severity: null,
        },
        {
          id: "sc-2",
          title: "Meter readings",
          explanation: "Previous and present readings printed on the bill.",
          informationStatus: "FOUND",
          confidence: 0.88,
          basis: null,
          evidenceIds: ["ev-5"],
          value: "14,205 to 14,517",
          severity: null,
        },
        {
          id: "sc-3",
          title: "Itemized charges",
          explanation:
            "A line-by-line list of charges does not appear on the scanned page.",
          informationStatus: "NOT_FOUND",
          confidence: null,
          basis: null,
          evidenceIds: [],
          value: null,
          severity: null,
        },
      ],
    },
  ],
  evidence: [
    {
      id: "ev-1",
      documentId,
      pageNumber: 1,
      excerpt:
        "Lakeview Electric Cooperative. Billing period: October 1 - October 31, 2026. Account No. 0012-3456-7",
      sourceType: "OCR_TEXT",
      wordStart: 0,
      wordEnd: 16,
    },
    {
      id: "ev-2",
      documentId,
      pageNumber: 1,
      excerpt: "Total amount due PHP 3,482.50",
      sourceType: "OCR_TEXT",
      wordStart: 58,
      wordEnd: 62,
    },
    {
      id: "ev-3",
      documentId,
      pageNumber: 1,
      excerpt: "Due date: November 20, 2026",
      sourceType: "OCR_TEXT",
      wordStart: 63,
      wordEnd: 67,
    },
    {
      id: "ev-4",
      documentId,
      pageNumber: 1,
      excerpt:
        "A surcharge of 2% per month will be applied to overdue balances. Service may be disconnected after due date notice.",
      sourceType: "OCR_TEXT",
      wordStart: 70,
      wordEnd: 89,
    },
    {
      id: "ev-5",
      documentId,
      pageNumber: 1,
      excerpt:
        "Consumption: 312 kWh. Previous reading 14,205. Present reading 14,517",
      sourceType: "OCR_TEXT",
      wordStart: 30,
      wordEnd: 41,
    },
  ],
  limitations: [
    {
      id: "lim-1",
      text: "The total amount and customer name were not printed clearly. Please check them against your original bill.",
      scope: "PAGE",
      pageNumbers: [1],
    },
    {
      id: "lim-2",
      text: "This explanation does not replace the provider's official statement of account.",
      scope: "ANALYSIS",
      pageNumbers: [],
    },
  ],
  reviewRequirements: [
    {
      id: "rr-1",
      field: "Total amount due",
      reason:
        "This is the amount you would pay and it was read with low confidence (58%). A wrong digit would change what you owe.",
      impact: "HIGH",
      pageNumber: 1,
      reviewStatus: "PENDING",
      level: "REQUIRED",
      evidenceIds: ["ev-2"],
    },
  ],
  analysisMetadata: {
    analyzedAt: "2026-11-15T10:05:00+08:00",
    modelInstanceId: "mock-instance",
    language: "en",
    totalPages: 1,
    pagesAnalyzed: 1,
    unavailablePages: [],
    isPartial: false,
  },
};

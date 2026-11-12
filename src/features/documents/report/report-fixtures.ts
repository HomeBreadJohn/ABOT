import {
  mockNeedsCorrectionAnalysis,
  mockPartialAnalysis,
  mockUtilityBillAnalysis,
  type AnalysisResult,
} from "@/contracts";
import type { DocumentLifecycle } from "@/contracts/common";

/**
 * shortcut: fixtures are keyed by hard-coded demo ids, when real data lands
 * the report should load the AnalysisResult from the document service by id.
 */
export interface ReportFixture {
  readonly documentId: string;
  readonly title: string;
  readonly lifecycle: DocumentLifecycle;
  readonly analysis: AnalysisResult;
}

const FIXTURES: Record<string, ReportFixture> = {
  "mock-utility-bill": {
    documentId: "mock-utility-bill",
    title: "Electric bill",
    lifecycle: "COMPLETED",
    analysis: mockUtilityBillAnalysis,
  },
  "mock-partial": {
    documentId: "mock-partial",
    title: "Loan statement",
    lifecycle: "OCR_PARTIAL",
    analysis: mockPartialAnalysis,
  },
  "mock-needs-correction": {
    documentId: "mock-needs-correction",
    title: "Water bill",
    lifecycle: "NEEDS_CORRECTION",
    analysis: mockNeedsCorrectionAnalysis,
  },
  "mock-analyzing": {
    documentId: "mock-analyzing",
    title: "Clearance letter",
    lifecycle: "ANALYZING",
    analysis: mockUtilityBillAnalysis,
  },
  "mock-ocr-failed": {
    documentId: "mock-ocr-failed",
    title: "Blurred receipt",
    lifecycle: "OCR_FAILED",
    analysis: mockUtilityBillAnalysis,
  },
};

export function resolveReportFixture(
  documentId: string,
): ReportFixture | undefined {
  return FIXTURES[documentId];
}

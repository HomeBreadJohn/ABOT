import type { DocumentSummaryForView } from "@/features/documents/view-models";

/**
 * shortcut: hard-coded vault rows for the demo flow, replace with the real
 * document list query (listDocuments) once the service is wired to the UI.
 * Ids match the report fixtures in report-fixtures.ts so rows deep-link.
 */
export const MOCK_DOCUMENTS: readonly DocumentSummaryForView[] = [
  {
    documentId: "mock-utility-bill",
    title: "Electric bill",
    category: "UTILITIES",
    lifecycle: "COMPLETED",
    analysisStatus: "SUCCEEDED",
    subtype: "Electric bill",
    uploadedAt: "2026-11-01T08:00:00.000Z",
  },
  {
    documentId: "mock-analyzing",
    title: "Clearance letter",
    category: "GOVERNMENT",
    lifecycle: "ANALYZING",
    analysisStatus: "RUNNING",
    uploadedAt: "2026-11-10T08:00:00.000Z",
  },
  {
    documentId: "mock-needs-correction",
    title: "Water bill",
    category: "UTILITIES",
    lifecycle: "NEEDS_CORRECTION",
    analysisStatus: "SUCCEEDED",
    subtype: "Water bill",
    uploadedAt: "2026-11-03T08:00:00.000Z",
  },
  {
    documentId: "mock-ocr-failed",
    title: "Blurred receipt",
    category: "FINANCIAL",
    lifecycle: "OCR_FAILED",
    analysisStatus: "NONE",
    failureReason: "The photo was too blurry to read.",
    uploadedAt: "2026-11-08T08:00:00.000Z",
  },
];

export const MOCK_TODAY = "2026-11-12";

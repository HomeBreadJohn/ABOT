/**
 * Turns the document list contract's enums and raw strings into calm,
 * human-readable labels for the vault. Presentation only: no data access,
 * no business rules. The aim is a view that reads as useful, not alarming -
 * plain words over system codes, and status phrased as where a document is,
 * not as a warning.
 */
import type {
  DocumentCategory,
  DocumentLifecycle,
} from "@/contracts";

/** Plain-language name for each document category. */
const CATEGORY_LABELS: Record<DocumentCategory, string> = {
  GOVERNMENT: "Government",
  FINANCIAL: "Financial",
  EMPLOYMENT: "Employment",
  LEGAL: "Legal",
  MEDICAL: "Medical",
  EDUCATION: "Education",
  UTILITIES: "Utilities",
  PERSONAL: "Personal",
  OTHER: "Other",
};

export function categoryLabel(category: DocumentCategory | null): string {
  if (!category) return "Not yet sorted";
  return CATEGORY_LABELS[category];
}

/** The calm status a reader sees: what is happening, not an error code. */
export type DocumentStatusTone = "progress" | "ready" | "needs-you" | "stalled";

export type DocumentStatus = {
  label: string;
  tone: DocumentStatusTone;
};

/**
 * Lifecycle to a short status phrase. Failures are named plainly and paired
 * with a recovery the reader can act on, rather than shouting "FAILED".
 */
const STATUS_BY_LIFECYCLE: Record<DocumentLifecycle, DocumentStatus> = {
  AWAITING_UPLOAD: { label: "Waiting to upload", tone: "progress" },
  UPLOADED: { label: "Received", tone: "progress" },
  OCR_PROCESSING: { label: "Reading document", tone: "progress" },
  OCR_READY: { label: "Read, preparing analysis", tone: "progress" },
  OCR_PARTIAL: { label: "Partly read", tone: "needs-you" },
  OCR_FAILED: { label: "Couldn't read this one", tone: "stalled" },
  ANALYZING: { label: "Understanding contents", tone: "progress" },
  NEEDS_CORRECTION: { label: "Needs a quick check", tone: "needs-you" },
  REVIEW_REQUIRED: { label: "Ready for your review", tone: "needs-you" },
  ANALYSIS_FAILED: { label: "Analysis didn't finish", tone: "stalled" },
  COMPLETED: { label: "Ready to read", tone: "ready" },
};

export function documentStatus(lifecycle: DocumentLifecycle): DocumentStatus {
  return STATUS_BY_LIFECYCLE[lifecycle];
}

/**
 * Why a document sits in the attention group, in a single plain phrase.
 * Deadline pressure is phrased in the next helper; this covers lifecycle.
 */
export function attentionReason(
  lifecycle: DocumentLifecycle,
): string | null {
  switch (lifecycle) {
    case "REVIEW_REQUIRED":
      return "Ready for your review";
    case "NEEDS_CORRECTION":
      return "A detail needs checking";
    case "OCR_FAILED":
      return "Couldn't be read - you can retry";
    case "ANALYSIS_FAILED":
      return "Analysis didn't finish - you can retry";
    default:
      return null;
  }
}

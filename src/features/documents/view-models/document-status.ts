import type { DocumentLifecycle } from "@/contracts";
import type { PresentationTone } from "@/lib/presentation";

/** The contract's lifecycle is the document status shown by the vault. */
export type DocumentStatus = DocumentLifecycle;

export type StatusIcon =
  | "inbox"
  | "scan-text"
  | "book-check"
  | "book-open-text"
  | "pencil-line"
  | "eye"
  | "file-warning"
  | "file-x"
  | "circle-alert"
  | "file-check";

export type StatusShape = "hollow" | "half" | "triangle" | "diamond" | "filled";

export type VaultStatusGroup = "attention" | "in_progress" | "ready";

export type AttentionReason =
  | "NEEDS_CORRECTION"
  | "DATE_PAST"
  | "PROCESSING_FAILED"
  | "DATE_SOON"
  | "PAGES_UNREADABLE"
  | "DATES_TO_CONFIRM"
  | "REVIEW_SUGGESTED";

export interface DocumentStatusView {
  readonly status: DocumentStatus;
  readonly label: string;
  readonly description: string;
  readonly icon: StatusIcon;
  readonly tone: PresentationTone;
  readonly shape: StatusShape;
  readonly group: VaultStatusGroup;
  /** True only while the pipeline is actively doing work. */
  readonly isProcessing: boolean;
  /** Status-only attention signal; date attention is calculated elsewhere. */
  readonly statusAttention: AttentionReason | null;
}

/**
 * Keep this map total. Adding a lifecycle value to the shared contract must
 * produce a type error here before it can reach the document UI.
 */
export const DOCUMENT_STATUS_VIEWS = {
  AWAITING_UPLOAD: {
    label: "Waiting for upload",
    description: "Choose a file to begin.",
    icon: "inbox",
    tone: "neutral",
    shape: "hollow",
    group: "in_progress",
    isProcessing: false,
    statusAttention: null,
  },
  UPLOADED: {
    label: "Document received",
    description: "It's saved and waiting to be read.",
    icon: "inbox",
    tone: "neutral",
    shape: "hollow",
    group: "in_progress",
    isProcessing: false,
    statusAttention: null,
  },
  OCR_PROCESSING: {
    label: "Reading document",
    description: "We're reading the text in your file.",
    icon: "scan-text",
    tone: "informative",
    shape: "half",
    group: "in_progress",
    isProcessing: true,
    statusAttention: null,
  },
  OCR_READY: {
    label: "Document read",
    description: "The text is ready. Understanding comes next.",
    icon: "book-check",
    tone: "informative",
    shape: "half",
    group: "in_progress",
    isProcessing: false,
    statusAttention: null,
  },
  ANALYZING: {
    label: "Understanding contents",
    description: "We're working out what this document means for you.",
    icon: "book-open-text",
    tone: "informative",
    shape: "half",
    group: "in_progress",
    isProcessing: true,
    statusAttention: null,
  },
  NEEDS_CORRECTION: {
    label: "Please check some details",
    description:
      "Some important details were hard to read. The report may change after you check them.",
    icon: "pencil-line",
    tone: "caution",
    shape: "triangle",
    group: "attention",
    isProcessing: false,
    statusAttention: "NEEDS_CORRECTION",
  },
  REVIEW_REQUIRED: {
    label: "Report ready, review suggested",
    description: "Your report is ready. A few details are worth a second look.",
    icon: "eye",
    tone: "informative",
    shape: "half",
    group: "attention",
    isProcessing: false,
    statusAttention: "REVIEW_SUGGESTED",
  },
  OCR_PARTIAL: {
    label: "Some pages couldn't be read",
    description: "Part of this file was hard to read.",
    icon: "file-warning",
    tone: "caution",
    shape: "triangle",
    group: "attention",
    isProcessing: false,
    statusAttention: "PAGES_UNREADABLE",
  },
  OCR_FAILED: {
    label: "We couldn't read this file",
    description: "Try a clearer photo or a different file.",
    icon: "file-x",
    tone: "critical",
    shape: "diamond",
    group: "attention",
    isProcessing: false,
    statusAttention: "PROCESSING_FAILED",
  },
  ANALYSIS_FAILED: {
    label: "Analysis didn't finish",
    description: "Your document is safe. It can be tried again later.",
    icon: "circle-alert",
    tone: "critical",
    shape: "diamond",
    group: "attention",
    isProcessing: false,
    statusAttention: "PROCESSING_FAILED",
  },
  COMPLETED: {
    label: "Report ready",
    description: "Your report is ready to read.",
    icon: "file-check",
    tone: "positive",
    shape: "filled",
    group: "ready",
    isProcessing: false,
    statusAttention: null,
  },
} as const satisfies Record<DocumentStatus, Omit<DocumentStatusView, "status">>;

export function presentDocumentStatus(
  status: DocumentStatus,
): DocumentStatusView {
  return { status, ...DOCUMENT_STATUS_VIEWS[status] };
}

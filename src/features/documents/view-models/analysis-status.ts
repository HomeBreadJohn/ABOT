import type { PresentationTone } from "@/lib/presentation";
import type {
  AttentionReason,
  DocumentStatus,
  StatusIcon,
  StatusShape,
  VaultStatusGroup,
} from "@/features/documents/view-models/document-status";

export type AnalysisStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";

/** The analysis record shape used by the document service when one exists. */
export interface LatestAnalysis {
  readonly status: AnalysisStatus;
  readonly completedAt?: string | null;
}

/**
 * `NONE` and `SUCCEEDED` are accepted for compatibility with the current
 * shared list response. They are normalized to the view model's null and
 * COMPLETED states without changing the contract.
 */
export type AnalysisStatusInput =
  | AnalysisStatus
  | "NONE"
  | "SUCCEEDED"
  | "RUNNING"
  | "FAILED"
  | LatestAnalysis
  | null;

export interface AnalysisStatusView {
  readonly status: AnalysisStatus | null;
  readonly label: string;
  readonly description: string;
  readonly icon: StatusIcon;
  readonly tone: PresentationTone;
  readonly shape: StatusShape;
  readonly group: VaultStatusGroup;
  readonly isProcessing: boolean;
  readonly attentionReason: AttentionReason | null;
}

type AnalysisStatusDescriptor = Omit<AnalysisStatusView, "status">;

const ANALYSIS_STATUS_VIEWS: Record<
  "NONE" | AnalysisStatus,
  AnalysisStatusDescriptor
> = {
  NONE: {
    label: "Not started",
    description: "Analysis has not started.",
    icon: "inbox",
    tone: "neutral",
    shape: "hollow",
    group: "in_progress",
    isProcessing: false,
    attentionReason: null,
  },
  QUEUED: {
    label: "Waiting to start",
    description: "Analysis is waiting to begin.",
    icon: "inbox",
    tone: "informative",
    shape: "hollow",
    group: "in_progress",
    isProcessing: false,
    attentionReason: null,
  },
  RUNNING: {
    label: "In progress",
    description: "Analysis is in progress.",
    icon: "scan-text",
    tone: "informative",
    shape: "half",
    group: "in_progress",
    isProcessing: true,
    attentionReason: null,
  },
  COMPLETED: {
    label: "Done",
    description: "Analysis is complete.",
    icon: "file-check",
    tone: "positive",
    shape: "filled",
    group: "ready",
    isProcessing: false,
    attentionReason: null,
  },
  FAILED: {
    label: "Didn't finish",
    description: "Analysis didn't finish.",
    icon: "circle-alert",
    tone: "critical",
    shape: "diamond",
    group: "attention",
    isProcessing: false,
    attentionReason: "PROCESSING_FAILED",
  },
};

function normalizeAnalysisStatus(
  latest: AnalysisStatusInput,
): "NONE" | AnalysisStatus {
  const rawStatus =
    typeof latest === "object" && latest !== null ? latest.status : latest;

  switch (rawStatus) {
    case "NONE":
      return "NONE";
    case "SUCCEEDED":
      return "COMPLETED";
    case "QUEUED":
    case "RUNNING":
    case "COMPLETED":
    case "FAILED":
      return rawStatus;
    default:
      return "NONE";
  }
}

/**
 * Present every analysis state for every document lifecycle. The lifecycle is
 * used only for the provisional completed label; it never creates progress.
 */
export function presentAnalysisStatus(
  latest: AnalysisStatusInput,
  documentStatus: DocumentStatus,
): AnalysisStatusView {
  const status = normalizeAnalysisStatus(latest);
  const descriptor = ANALYSIS_STATUS_VIEWS[status];

  if (status === "COMPLETED" && documentStatus === "NEEDS_CORRECTION") {
    return {
      status,
      ...descriptor,
      label: "Done, provisional",
      description:
        "Analysis is complete, but some details still need checking.",
      tone: "caution",
      group: "attention",
      attentionReason: "NEEDS_CORRECTION",
    };
  }

  return { status: status === "NONE" ? null : status, ...descriptor };
}

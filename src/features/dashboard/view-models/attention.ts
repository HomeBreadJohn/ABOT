import type {
  DeadlineItem,
  IsoDate,
} from "@/features/documents/view-models/deadlines";
import {
  type DocumentCardView,
  type DocumentSummaryForView,
  toDocumentCardView,
} from "@/features/documents/view-models/document-card";
import { presentDocumentStatus } from "@/features/documents/view-models/document-status";

export type AttentionReason =
  | "NEEDS_CORRECTION"
  | "DATE_PAST"
  | "PROCESSING_FAILED"
  | "DATE_SOON"
  | "PAGES_UNREADABLE"
  | "DATES_TO_CONFIRM"
  | "REVIEW_SUGGESTED";

export const ATTENTION_RANK: Readonly<Record<AttentionReason, number>> = {
  NEEDS_CORRECTION: 0,
  DATE_PAST: 1,
  PROCESSING_FAILED: 2,
  DATE_SOON: 3,
  PAGES_UNREADABLE: 4,
  DATES_TO_CONFIRM: 5,
  REVIEW_SUGGESTED: 6,
};

export interface AttentionItem {
  readonly document: DocumentCardView;
  readonly reasons: readonly AttentionReason[];
  readonly primaryReason: AttentionReason;
  readonly message: string;
  readonly actionLabel: "Review" | "Open";
}

const UNCERTAIN_DATE_STATUSES = new Set([
  "UNCLEAR",
  "NOT_FOUND",
  "CONFLICTING",
]);

function documentId(document: DocumentSummaryForView): string {
  return document.documentId;
}

function documentStatus(
  document: DocumentSummaryForView,
): Parameters<typeof presentDocumentStatus>[0] {
  return document.lifecycle ?? document.status ?? "AWAITING_UPLOAD";
}

function documentDateItems(
  document: DocumentSummaryForView,
  items: readonly DeadlineItem[],
): readonly DeadlineItem[] {
  return items.filter(
    (item) => item.documentId === documentId(document) && item.kind === "document_date",
  );
}

function pushReason(
  reasons: AttentionReason[],
  reason: AttentionReason,
): void {
  if (!reasons.includes(reason)) {
    reasons.push(reason);
  }
}

/** Returns the complete, rank-ordered set of reasons for one document. */
export function classifyAttention(
  document: DocumentSummaryForView,
  itemsForDocument: readonly DeadlineItem[],
): AttentionReason[] {
  const reasons: AttentionReason[] = [];
  const statusReason = presentDocumentStatus(documentStatus(document)).statusAttention;

  if (statusReason) {
    pushReason(reasons, statusReason);
  }

  const dateItems = itemsForDocument.filter(
    (item) => item.kind === "document_date",
  );

  if (dateItems.some((item) => item.bucket === "PAST")) {
    pushReason(reasons, "DATE_PAST");
  }

  if (
    dateItems.some(
      (item) => item.bucket === "TODAY" || item.bucket === "THIS_WEEK",
    )
  ) {
    pushReason(reasons, "DATE_SOON");
  }

  if (
    dateItems.some((item) => UNCERTAIN_DATE_STATUSES.has(item.certainty))
  ) {
    pushReason(reasons, "DATES_TO_CONFIRM");
  }

  return reasons.sort((left, right) => ATTENTION_RANK[left] - ATTENTION_RANK[right]);
}

function earliestRelevantDate(
  item: AttentionItem,
  items: readonly DeadlineItem[],
): IsoDate | null {
  const relevantBuckets = new Set([
    "PAST",
    "TODAY",
    "THIS_WEEK",
    "TO_CONFIRM",
  ]);
  const dates = items
    .filter(
      (deadline) =>
        deadline.documentId === item.document.id &&
        deadline.kind === "document_date" &&
        (relevantBuckets.has(deadline.bucket) ||
          UNCERTAIN_DATE_STATUSES.has(deadline.certainty)),
    )
    .flatMap((deadline) => deadline.dates)
    .filter((date) => date.length > 0)
    .sort();

  return dates[0] ?? null;
}

function compareIds(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function compareUploadedAtDescending(
  left: DocumentCardView,
  right: DocumentCardView,
): number {
  const leftTime = Date.parse(left.uploadedAt.iso);
  const rightTime = Date.parse(right.uploadedAt.iso);

  if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
    if (leftTime !== rightTime) {
      return rightTime - leftTime;
    }
  } else if (left.uploadedAt.iso !== right.uploadedAt.iso) {
    return right.uploadedAt.iso.localeCompare(left.uploadedAt.iso, "en");
  }

  return compareIds(left.id, right.id);
}

function compareAttentionWithItems(
  left: AttentionItem,
  right: AttentionItem,
  items: readonly DeadlineItem[],
): number {
  const rankDifference =
    ATTENTION_RANK[left.primaryReason] - ATTENTION_RANK[right.primaryReason];
  if (rankDifference !== 0) {
    return rankDifference;
  }

  const leftDate = earliestRelevantDate(left, items);
  const rightDate = earliestRelevantDate(right, items);
  if (leftDate === null && rightDate !== null) {
    return 1;
  }
  if (leftDate !== null && rightDate === null) {
    return -1;
  }
  if (leftDate !== null && rightDate !== null && leftDate !== rightDate) {
    return leftDate.localeCompare(rightDate, "en");
  }

  return compareUploadedAtDescending(left.document, right.document);
}

/** Sorts attention items without depending on their input order. */
export function sortAttention(
  items: readonly AttentionItem[],
  deadlineItems: readonly DeadlineItem[] = [],
): AttentionItem[] {
  return [...items].sort((left, right) =>
    compareAttentionWithItems(left, right, deadlineItems),
  );
}

export function compareAttentionItems(
  left: AttentionItem,
  right: AttentionItem,
  deadlineItems: readonly DeadlineItem[] = [],
): number {
  return compareAttentionWithItems(left, right, deadlineItems);
}

function dateLabel(date: IsoDate): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function messageForReason(
  reason: AttentionReason,
  document: DocumentSummaryForView,
  items: readonly DeadlineItem[],
  today: IsoDate,
): string {
  switch (reason) {
    case "NEEDS_CORRECTION":
      return "Please check some details before relying on this report.";
    case "DATE_PAST":
      return "A date in this document has passed.";
    case "PROCESSING_FAILED":
    case "PAGES_UNREADABLE":
      return (
        document.failureReason?.trim() ||
        presentDocumentStatus(documentStatus(document)).description
      );
    case "DATE_SOON": {
      const date = documentDateItems(document, items)
        .filter(
          (item) => item.bucket === "TODAY" || item.bucket === "THIS_WEEK",
        )
        .flatMap((item) => item.dates)
        .sort()[0];
      if (!date || date === today) {
        return "Something is due today.";
      }
      return `Something is due on ${dateLabel(date)}.`;
    }
    case "DATES_TO_CONFIRM":
      return "Different or unclear dates were found. Please confirm them.";
    case "REVIEW_SUGGESTED":
      return "A few details are worth a second look.";
  }
}

function actionForReason(reason: AttentionReason): "Review" | "Open" {
  return reason === "NEEDS_CORRECTION" ||
    reason === "DATES_TO_CONFIRM" ||
    reason === "REVIEW_SUGGESTED"
    ? "Review"
    : "Open";
}

/** Builds dashboard attention; vault status groups remain lifecycle-only. */
export function buildAttentionItems(
  documents: readonly DocumentSummaryForView[],
  items: readonly DeadlineItem[],
  today: IsoDate,
): AttentionItem[] {
  const attentionItems = documents.flatMap((document) => {
    const documentItems = documentDateItems(document, items);
    const reasons = classifyAttention(document, documentItems);
    if (reasons.length === 0) {
      return [];
    }

    const primaryReason = reasons[0];
    return [
      {
        document: toDocumentCardView(document, {
          today,
          deadlineItems: items,
        }),
        reasons,
        primaryReason,
        message: messageForReason(primaryReason, document, items, today),
        actionLabel: actionForReason(primaryReason),
      },
    ];
  });

  return sortAttention(attentionItems, items);
}

import {
  CATEGORY_LABELS,
  categoryFilterValue,
  type CategoryFilterValue,
  type VaultQuery,
} from "@/features/documents/schemas/vault-query";
import {
  buildAttentionItems,
  compareAttentionItems,
  type AttentionItem,
} from "@/features/dashboard/view-models/attention";
import type { DeadlineItem, IsoDate } from "@/features/documents/view-models/deadlines";
import type { DocumentSummaryForView } from "@/features/documents/view-models/document-card";
import {
  DOCUMENT_STATUS_VIEWS,
  type DocumentStatus,
} from "@/features/documents/view-models/document-status";

export type VaultStatusGroup = "attention" | "in_progress" | "ready";

export const VAULT_STATUS_GROUPS: Readonly<
  Record<VaultStatusGroup, readonly DocumentStatus[]>
> = {
  attention: [
    "NEEDS_CORRECTION",
    "REVIEW_REQUIRED",
    "OCR_PARTIAL",
    "OCR_FAILED",
    "ANALYSIS_FAILED",
  ],
  in_progress: [
    "AWAITING_UPLOAD",
    "UPLOADED",
    "OCR_PROCESSING",
    "OCR_READY",
    "ANALYZING",
  ],
  ready: ["COMPLETED"],
};

export function getVaultStatusGroup(status: DocumentStatus): VaultStatusGroup {
  return DOCUMENT_STATUS_VIEWS[status].group;
}

/** Fold accents and case without changing the original display values. */
export function foldSearchText(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase("en");
}

function documentId(document: DocumentSummaryForView): string {
  return document.documentId;
}

function documentStatus(document: DocumentSummaryForView): DocumentStatus {
  return document.lifecycle ?? document.status ?? "AWAITING_UPLOAD";
}

function searchText(document: DocumentSummaryForView): string {
  const category = categoryFilterValue(document.category);
  const categoryLabel =
    category === "all" || category === "unsorted"
      ? "Not yet sorted"
      : CATEGORY_LABELS[category];

  return foldSearchText(
    [
      document.title,
      document.originalFilename ?? "",
      document.subtype ?? "",
      categoryLabel,
    ].join(" "),
  );
}

function matchesSearch(document: DocumentSummaryForView, query: VaultQuery): boolean {
  const terms = foldSearchText(query.q).split(/\s+/u).filter(Boolean);
  const text = searchText(document);
  return terms.every((term) => text.includes(term));
}

function matchesCategory(
  document: DocumentSummaryForView,
  category: CategoryFilterValue,
): boolean {
  return category === "all" || categoryFilterValue(document.category) === category;
}

function matchesStatus(
  document: DocumentSummaryForView,
  status: VaultQuery["status"],
): boolean {
  return status === "all" || getVaultStatusGroup(documentStatus(document)) === status;
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

function uploadedAt(document: DocumentSummaryForView): string {
  return document.uploadedAt ?? document.createdAt ?? "";
}

function compareUploadedAtDescending(
  left: DocumentSummaryForView,
  right: DocumentSummaryForView,
): number {
  const leftValue = uploadedAt(left);
  const rightValue = uploadedAt(right);
  const leftTime = Date.parse(leftValue);
  const rightTime = Date.parse(rightValue);
  if (
    Number.isFinite(leftTime) &&
    Number.isFinite(rightTime) &&
    leftTime !== rightTime
  ) {
    return rightTime - leftTime;
  }
  if (leftValue !== rightValue) {
    return rightValue.localeCompare(leftValue, "en");
  }
  return compareIds(documentId(left), documentId(right));
}

function compareUploadedAtAscending(
  left: DocumentSummaryForView,
  right: DocumentSummaryForView,
): number {
  const leftValue = uploadedAt(left);
  const rightValue = uploadedAt(right);
  const leftTime = Date.parse(leftValue);
  const rightTime = Date.parse(rightValue);
  if (
    Number.isFinite(leftTime) &&
    Number.isFinite(rightTime) &&
    leftTime !== rightTime
  ) {
    return leftTime - rightTime;
  }
  if (leftValue !== rightValue) {
    return leftValue.localeCompare(rightValue, "en");
  }
  return compareIds(documentId(left), documentId(right));
}

function earliestNonPastDate(
  document: DocumentSummaryForView,
  deadlineItems: readonly DeadlineItem[],
  today: IsoDate,
): IsoDate | null {
  const dates = deadlineItems
    .filter(
      (item) =>
        item.documentId === documentId(document) &&
        item.dates.length > 0 &&
        item.dates.some((date) => date >= today),
    )
    .flatMap((item) => item.dates)
    .filter((date) => date >= today)
    .sort();
  return dates[0] ?? null;
}

function compareNextDate(
  left: DocumentSummaryForView,
  right: DocumentSummaryForView,
  context: { readonly today: IsoDate; readonly deadlineItems: readonly DeadlineItem[] },
): number {
  const leftDate = earliestNonPastDate(left, context.deadlineItems, context.today);
  const rightDate = earliestNonPastDate(right, context.deadlineItems, context.today);

  if (leftDate === null && rightDate !== null) {
    return 1;
  }
  if (leftDate !== null && rightDate === null) {
    return -1;
  }
  if (leftDate !== null && rightDate !== null && leftDate !== rightDate) {
    return leftDate.localeCompare(rightDate, "en");
  }

  return compareUploadedAtDescending(left, right);
}

function compareTitle(left: DocumentSummaryForView, right: DocumentSummaryForView): number {
  const result = left.title.localeCompare(right.title, "en", {
    sensitivity: "base",
    numeric: true,
  });
  return result === 0
    ? compareIds(documentId(left), documentId(right))
    : result;
}

function attentionMap(
  documents: readonly DocumentSummaryForView[],
  deadlineItems: readonly DeadlineItem[],
  today: IsoDate,
): ReadonlyMap<string, AttentionItem> {
  return new Map(
    buildAttentionItems(documents, deadlineItems, today).map((item) => [
      item.document.id,
      item,
    ]),
  );
}

function compareAttentionSort(
  left: DocumentSummaryForView,
  right: DocumentSummaryForView,
  attentionItems: ReadonlyMap<string, AttentionItem>,
  deadlineItems: readonly DeadlineItem[],
): number {
  const leftAttention = attentionItems.get(documentId(left));
  const rightAttention = attentionItems.get(documentId(right));

  if (leftAttention && !rightAttention) {
    return -1;
  }
  if (!leftAttention && rightAttention) {
    return 1;
  }
  if (leftAttention && rightAttention) {
    return compareAttentionItems(leftAttention, rightAttention, deadlineItems);
  }

  return compareUploadedAtDescending(left, right);
}

function compareDocuments(
  left: DocumentSummaryForView,
  right: DocumentSummaryForView,
  query: VaultQuery,
  context: { readonly today: IsoDate; readonly deadlineItems: readonly DeadlineItem[] },
  attentionItems: ReadonlyMap<string, AttentionItem>,
): number {
  switch (query.sort) {
    case "oldest":
      return compareUploadedAtAscending(left, right);
    case "next_date":
      return compareNextDate(left, right, context);
    case "title":
      return compareTitle(left, right);
    case "attention":
      return compareAttentionSort(
        left,
        right,
        attentionItems,
        context.deadlineItems,
      );
    case "newest":
      return compareUploadedAtDescending(left, right);
  }
}

/**
 * Applies the vault's independent filters, then one of its five total sorts.
 * Status groups intentionally use lifecycle status only, never date attention.
 */
export function filterAndSortDocuments(
  documents: readonly DocumentSummaryForView[],
  query: VaultQuery,
  context: { readonly today: IsoDate; readonly deadlineItems: readonly DeadlineItem[] },
): DocumentSummaryForView[] {
  const visible = documents.filter(
    (document) =>
      matchesSearch(document, query) &&
      matchesCategory(document, query.category) &&
      matchesStatus(document, query.status),
  );
  const attentionItems = attentionMap(visible, context.deadlineItems, context.today);

  return [...visible].sort((left, right) =>
    compareDocuments(left, right, query, context, attentionItems),
  );
}

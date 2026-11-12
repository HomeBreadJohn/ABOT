import type { z } from "zod";

import {
  documentListItemSchema,
  type AllowedMimeType,
  type DocumentCategory,
  type DocumentLifecycle,
} from "@/contracts";
import {
  type AnalysisStatusInput,
  type AnalysisStatusView,
  type LatestAnalysis,
  presentAnalysisStatus,
} from "@/features/documents/view-models/analysis-status";
import {
  type CategoryView,
  presentCategory,
} from "@/features/documents/view-models/category";
import {
  type DocumentStatusView,
  presentDocumentStatus,
} from "@/features/documents/view-models/document-status";

export type IsoDate = string;

type ContractDocumentListItem = z.infer<typeof documentListItemSchema>;

/**
 * The current contract supplies the required list fields. The other fields
 * are optional here because the initial schema does not expose detail columns
 * yet; lifecycle and richer service rows can use them when available.
 */
export type DocumentSummaryForView = Pick<
  ContractDocumentListItem,
  "documentId" | "title" | "category"
> &
  Partial<
    Pick<
      ContractDocumentListItem,
      | "lifecycle"
      | "analysisStatus"
      | "createdAt"
      | "nextDeadline"
      | "needsAttention"
    >
  > & {
    readonly status?: DocumentLifecycle;
    readonly originalFilename?: string;
    readonly mimeType?: AllowedMimeType | string;
    readonly fileSize?: number;
    readonly subtype?: string | null;
    readonly pageCount?: number | null;
    readonly failureReason?: string | null;
    readonly uploadedAt?: string;
    readonly latestAnalysis?: LatestAnalysis | null;
    readonly deadlines?: readonly {
      readonly title: string;
      readonly date: string | null;
    }[];
  };

/** The date item shape consumed by a document card. */
export interface DeadlineItem {
  readonly key: string;
  readonly kind: "document_date" | "reminder";
  readonly documentId: string | null;
  readonly documentTitle: string | null;
  readonly title: string;
  readonly dates: readonly IsoDate[];
  readonly time: string | null;
  readonly certainty: string;
  readonly provisional: boolean;
  readonly hasReminder: boolean;
  readonly bucket: string;
}

export interface DocumentCardView {
  readonly id: string;
  readonly href: `/documents/${string}`;
  readonly title: string;
  readonly originalFilename: string;
  readonly category: CategoryView;
  readonly subtype: string | null;
  readonly uploadedAt: { readonly iso: string; readonly label: string };
  readonly fileTypeLabel: string;
  readonly fileSizeLabel: string;
  readonly pageCountLabel: string | null;
  readonly status: DocumentStatusView;
  readonly analysis: AnalysisStatusView;
  readonly nextDate: DeadlineItem | null;
  readonly failureReason: string | null;
}

const FILE_TYPE_LABELS: Readonly<Record<string, string>> = {
  "application/pdf": "PDF",
  "image/jpeg": "JPEG image",
  "image/png": "PNG image",
  "image/tiff": "TIFF image",
  "image/webp": "WebP image",
};

const MANILA_DATE_FORMATTER = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  year: "numeric",
  month: "short",
  day: "numeric",
});

function parseUploadedAt(value: string): Date | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    const timestamp = Date.UTC(year, month - 1, day);
    const parsed = new Date(timestamp);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatUploadedDate(value: string): string {
  const parsed = parseUploadedAt(value);
  return parsed ? MANILA_DATE_FORMATTER.format(parsed) : "Date unavailable";
}

export function formatCategory(
  category: DocumentCategory | null,
): CategoryView {
  return presentCategory(category);
}

export function formatFileType(mimeType: string | null | undefined): string {
  if (!mimeType) {
    return "Unknown file type";
  }

  return FILE_TYPE_LABELS[mimeType.trim().toLowerCase()] ?? "Unknown file type";
}

export function formatFileSize(fileSize: number | null | undefined): string {
  if (
    fileSize === null ||
    fileSize === undefined ||
    !Number.isFinite(fileSize) ||
    fileSize < 0
  ) {
    return "Unknown size";
  }

  if (fileSize < 1024) {
    return `${fileSize} B`;
  }

  const units = ["KB", "MB", "GB", "TB"];
  let value = fileSize;
  let unitIndex = -1;

  do {
    value /= 1024;
    unitIndex += 1;
  } while (value >= 1024 && unitIndex < units.length - 1);

  const rounded = value >= 10 ? value.toFixed(0) : value.toFixed(1);
  return `${Number(rounded)} ${units[unitIndex]}`;
}

export function formatPageCount(
  pageCount: number | null | undefined,
): string | null {
  if (
    pageCount === null ||
    pageCount === undefined ||
    !Number.isInteger(pageCount) ||
    pageCount < 1
  ) {
    return null;
  }

  return `${pageCount} ${pageCount === 1 ? "page" : "pages"}`;
}

export function formatFailureReason(
  reason: string | null | undefined,
): string | null {
  const trimmed = reason?.trim();
  return trimmed ? trimmed : null;
}

/** Encode the identifier so an opaque document id cannot add path segments. */
export function documentHref(documentId: string): `/documents/${string}` {
  return `/documents/${encodeURIComponent(documentId)}`;
}

function resolveDocumentStatus(
  document: DocumentSummaryForView,
): DocumentLifecycle {
  return document.lifecycle ?? document.status ?? "AWAITING_UPLOAD";
}

function resolveAnalysisStatus(
  document: DocumentSummaryForView,
): AnalysisStatusInput {
  if (document.latestAnalysis !== undefined) {
    return document.latestAnalysis;
  }

  return document.analysisStatus ?? null;
}

function isNonPastDeadline(item: DeadlineItem, today: IsoDate): boolean {
  if (item.bucket === "PAST") {
    return false;
  }

  return item.dates.some((date) => date >= today);
}

function earliestDate(item: DeadlineItem): string {
  return (
    [...item.dates].sort((left, right) => left.localeCompare(right))[0] ??
    "9999-12-31"
  );
}

function nextDocumentDate(
  documentId: string,
  today: IsoDate,
  deadlineItems: readonly DeadlineItem[],
): DeadlineItem | null {
  return (
    deadlineItems
      .filter(
        (item) =>
          item.documentId === documentId &&
          item.kind === "document_date" &&
          isNonPastDeadline(item, today),
      )
      .sort(
        (left, right) =>
          earliestDate(left).localeCompare(earliestDate(right)) ||
          left.title.localeCompare(right.title, "en", {
            sensitivity: "base",
          }) ||
          left.key.localeCompare(right.key),
      )[0] ?? null
  );
}

export function toDocumentCardView(
  document: DocumentSummaryForView,
  context: {
    readonly today: IsoDate;
    readonly deadlineItems: readonly DeadlineItem[];
  },
): DocumentCardView {
  const status = resolveDocumentStatus(document);
  const uploadedAt = document.uploadedAt ?? document.createdAt ?? "";

  return {
    id: document.documentId,
    href: documentHref(document.documentId),
    title: document.title,
    originalFilename: document.originalFilename ?? document.title,
    category: formatCategory(document.category),
    subtype: document.subtype?.trim() || null,
    uploadedAt: { iso: uploadedAt, label: formatUploadedDate(uploadedAt) },
    fileTypeLabel: formatFileType(document.mimeType),
    fileSizeLabel: formatFileSize(document.fileSize),
    pageCountLabel: formatPageCount(document.pageCount),
    status: presentDocumentStatus(status),
    analysis: presentAnalysisStatus(resolveAnalysisStatus(document), status),
    nextDate: nextDocumentDate(
      document.documentId,
      context.today,
      context.deadlineItems,
    ),
    failureReason: formatFailureReason(document.failureReason),
  };
}

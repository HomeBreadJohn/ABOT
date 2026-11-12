import type { InformationStatus } from "@/contracts";
import {
  compareDateOnly,
  daysBetween,
  formatManilaTime,
  toManilaDate,
  type IsoDate,
} from "@/features/documents/view-models/date";

export type { IsoDate } from "@/features/documents/view-models/date";
export {
  compareDateOnly,
  dateOnlyToUtcDate,
  daysBetween,
  formatDateOnly,
  formatManilaTime,
  parseDateOnly,
  toManilaDate,
} from "@/features/documents/view-models/date";

export type DeadlineCertainty =
  | "FOUND"
  | "INFERRED"
  | "UNCLEAR"
  | "CONFLICTING"
  | "NOT_FOUND"
  | "UNSPECIFIED";

export type DeadlineBucket =
  "PAST" | "TODAY" | "THIS_WEEK" | "LATER" | "TO_CONFIRM";

export interface DeadlineSignal {
  readonly documentId: string;
  readonly sourceItemId: string;
  readonly title: string;
  readonly date: IsoDate | null;
  readonly informationStatus: InformationStatus;
  readonly provisional: boolean;
}

export interface DeadlineSummary {
  readonly title: string;
  readonly date: IsoDate | null;
}

/** The document fields needed by the pure deadline view model. */
export interface DeadlineDocument {
  readonly id?: string;
  readonly documentId?: string;
  readonly title: string;
  readonly status?: string;
  readonly lifecycle?: string;
  readonly deadlines?: readonly DeadlineSummary[];
}

/** A reminder input kept local so this module does not depend on a service implementation. */
export interface DeadlineReminder {
  readonly id: string;
  readonly documentId: string | null;
  readonly title: string;
  readonly dueAt: string;
  readonly status: "PENDING" | string;
}

export interface DeadlineItem {
  readonly key: string;
  readonly kind: "document_date" | "reminder";
  readonly documentId: string | null;
  readonly documentTitle: string | null;
  readonly title: string;
  readonly dates: readonly IsoDate[];
  readonly time: string | null;
  readonly certainty: DeadlineCertainty;
  readonly provisional: boolean;
  readonly hasReminder: boolean;
  readonly bucket: DeadlineBucket;
}

export const UPCOMING_WINDOW_DAYS = 30;
export const SOON_DAYS = 7;
export const PAST_WINDOW_DAYS = 14;

const BUCKET_ORDER: Readonly<Record<DeadlineBucket, number>> = {
  PAST: 0,
  TODAY: 1,
  THIS_WEEK: 2,
  LATER: 3,
  TO_CONFIRM: 4,
};

const KIND_ORDER = { document_date: 0, reminder: 1 } as const;

interface UnbucketedDeadlineItem extends Omit<DeadlineItem, "bucket"> {
  readonly bucket?: DeadlineBucket;
}

function documentIdOf(document: DeadlineDocument): string {
  const id = document.documentId ?? document.id;
  if (!id) throw new Error("A deadline document must have an id");
  return id;
}

function isNeedsCorrection(document: DeadlineDocument): boolean {
  return (
    document.status === "NEEDS_CORRECTION" ||
    document.lifecycle === "NEEDS_CORRECTION"
  );
}

function certaintyForSignal(signal: DeadlineSignal): DeadlineCertainty {
  if (signal.date === null) {
    return signal.informationStatus === "NOT_FOUND" ? "NOT_FOUND" : "UNCLEAR";
  }
  return signal.informationStatus;
}

function sourceIdForConflict(signals: readonly DeadlineSignal[]): string {
  return signals
    .map((signal) => signal.sourceItemId)
    .sort((left, right) => left.localeCompare(right, "en"))
    .join("|");
}

function uniqueSortedDates(dates: readonly IsoDate[]): IsoDate[] {
  return [...new Set(dates)].sort(compareDateOnly);
}

function sourceSignalOrder(
  left: DeadlineSignal,
  right: DeadlineSignal,
): number {
  const bySource = left.sourceItemId.localeCompare(right.sourceItemId, "en");
  if (bySource !== 0) return bySource;
  const byDate = (left.date ?? "").localeCompare(right.date ?? "");
  if (byDate !== 0) return byDate;
  return left.title.localeCompare(right.title, "en", { sensitivity: "base" });
}

function makeDocumentItem(
  document: DeadlineDocument,
  signal: DeadlineSignal,
  dates: readonly IsoDate[],
  certainty: DeadlineCertainty,
  sourceId: string,
  provisional: boolean,
): UnbucketedDeadlineItem {
  const documentId = documentIdOf(document);
  return {
    key: `document_date:${documentId}:${sourceId}`,
    kind: "document_date",
    documentId,
    documentTitle: document.title,
    title: signal.title,
    dates,
    time: null,
    certainty,
    provisional,
    hasReminder: false,
  };
}

function buildDocumentItems(
  document: DeadlineDocument,
  signals: readonly DeadlineSignal[],
): UnbucketedDeadlineItem[] {
  const orderedSignals = [...signals].sort(sourceSignalOrder);
  const provisional =
    isNeedsCorrection(document) ||
    orderedSignals.some((signal) => signal.provisional);
  const conflicting = orderedSignals.filter(
    (signal) =>
      signal.informationStatus === "CONFLICTING" && signal.date !== null,
  );
  const items: UnbucketedDeadlineItem[] = [];

  if (conflicting.length > 0) {
    const first = conflicting[0];
    items.push(
      makeDocumentItem(
        document,
        first,
        uniqueSortedDates(conflicting.map((signal) => signal.date as IsoDate)),
        "CONFLICTING",
        `conflict:${sourceIdForConflict(conflicting)}`,
        provisional,
      ),
    );
  }

  for (const signal of orderedSignals) {
    if (conflicting.includes(signal)) continue;
    items.push(
      makeDocumentItem(
        document,
        signal,
        signal.date === null ? [] : [signal.date],
        certaintyForSignal(signal),
        signal.sourceItemId,
        provisional,
      ),
    );
  }

  if (orderedSignals.length === 0) {
    const fallback = [...(document.deadlines ?? [])].sort((left, right) => {
      const byDate = (left.date ?? "").localeCompare(right.date ?? "");
      if (byDate !== 0) return byDate;
      return left.title.localeCompare(right.title, "en", {
        sensitivity: "base",
      });
    });
    const documentId = documentIdOf(document);
    for (const [index, deadline] of fallback.entries()) {
      const dates = deadline.date === null ? [] : [deadline.date];
      items.push({
        key: `document_date:${documentId}:fallback:${deadline.date ?? "none"}:${deadline.title}:${index}`,
        kind: "document_date",
        documentId,
        documentTitle: document.title,
        title: deadline.title,
        dates,
        time: null,
        certainty: deadline.date === null ? "UNCLEAR" : "UNSPECIFIED",
        provisional,
        hasReminder: false,
      });
    }
  }

  return items;
}

function itemEarliestDate(item: Pick<DeadlineItem, "dates">): IsoDate | null {
  if (item.dates.length === 0) return null;
  return [...item.dates].sort(compareDateOnly)[0];
}

export function assignDeadlineBucket(
  today: IsoDate,
  dates: readonly IsoDate[],
): DeadlineBucket | null {
  const earliest = itemEarliestDate({ dates });
  if (earliest === null) return "TO_CONFIRM";

  const difference = daysBetween(today, earliest);
  if (difference < -PAST_WINDOW_DAYS || difference > UPCOMING_WINDOW_DAYS)
    return null;
  if (difference < 0) return "PAST";
  if (difference === 0) return "TODAY";
  if (difference <= SOON_DAYS) return "THIS_WEEK";
  return "LATER";
}

export function compareDeadlineItems(
  left: DeadlineItem,
  right: DeadlineItem,
): number {
  const byBucket = BUCKET_ORDER[left.bucket] - BUCKET_ORDER[right.bucket];
  if (byBucket !== 0) return byBucket;

  const leftDate = itemEarliestDate(left);
  const rightDate = itemEarliestDate(right);
  if (leftDate !== null && rightDate !== null) {
    const byDate = compareDateOnly(leftDate, rightDate);
    if (byDate !== 0) return byDate;
  }

  const byKind = KIND_ORDER[left.kind] - KIND_ORDER[right.kind];
  if (byKind !== 0) return byKind;

  const byTitle = left.title.localeCompare(right.title, "en", {
    sensitivity: "base",
  });
  if (byTitle !== 0) return byTitle;
  return left.key.localeCompare(right.key, "en");
}

function withBucket(
  item: UnbucketedDeadlineItem,
  today: IsoDate,
): DeadlineItem | null {
  const bucket = assignDeadlineBucket(today, item.dates);
  if (bucket === null) return null;
  return { ...item, bucket };
}

function reminderOrder(
  left: DeadlineReminder,
  right: DeadlineReminder,
): number {
  const byId = left.id.localeCompare(right.id, "en");
  if (byId !== 0) return byId;
  const byDueAt = left.dueAt.localeCompare(right.dueAt);
  if (byDueAt !== 0) return byDueAt;
  return left.title.localeCompare(right.title, "en", { sensitivity: "base" });
}

function mergeReminders(
  items: readonly UnbucketedDeadlineItem[],
  reminders: readonly DeadlineReminder[],
): UnbucketedDeadlineItem[] {
  const result = items.map((item) => ({ ...item }));
  const byDocument = new Map<string, UnbucketedDeadlineItem[]>();
  for (const item of result) {
    if (item.kind !== "document_date" || item.documentId === null) continue;
    const existing = byDocument.get(item.documentId) ?? [];
    existing.push(item);
    byDocument.set(item.documentId, existing);
  }

  for (const reminder of [...reminders]
    .filter((item) => item.status === "PENDING")
    .sort(reminderOrder)) {
    const date = toManilaDate(reminder.dueAt);
    const candidates = (byDocument.get(reminder.documentId ?? "") ?? [])
      .filter((item) => item.dates.includes(date))
      .sort((left, right) => {
        const leftConflict = left.certainty === "CONFLICTING" ? 0 : 1;
        const rightConflict = right.certainty === "CONFLICTING" ? 0 : 1;
        return (
          leftConflict - rightConflict ||
          left.key.localeCompare(right.key, "en")
        );
      });
    const match = candidates[0];

    if (match) {
      const index = result.indexOf(match);
      result[index] = { ...match, hasReminder: true };
      continue;
    }

    const documentTitle = reminder.documentId
      ? (result.find((item) => item.documentId === reminder.documentId)
          ?.documentTitle ?? null)
      : null;
    result.push({
      key: `reminder:${reminder.documentId ?? "none"}:${reminder.id}`,
      kind: "reminder",
      documentId: reminder.documentId,
      documentTitle,
      title: reminder.title,
      dates: [date],
      time: formatManilaTime(reminder.dueAt),
      certainty: "FOUND",
      provisional: false,
      hasReminder: true,
    });
  }

  return result;
}

/** Return a neutral source cue for dates that came only from the document summary. */
export function deadlineSourceCue(
  item: Pick<DeadlineItem, "certainty">,
): string | null {
  return item.certainty === "UNSPECIFIED" ? "From your document" : null;
}

/** Return the fixed cue used for a provisional report. */
export function deadlineProvisionalCue(
  item: Pick<DeadlineItem, "provisional">,
): string | null {
  return item.provisional ? "Provisional, please check details" : null;
}

/** Return the safe date cue used when a source did not provide a usable date. */
export function deadlineDateCue(
  item: Pick<DeadlineItem, "dates">,
): string | null {
  return item.dates.length === 0 ? "Date unclear" : null;
}

/**
 * Build the dashboard's bounded deadline list. Dates outside the dashboard
 * window are omitted, but no source date is rewritten or selected.
 */
export function buildDeadlineItems(input: {
  readonly documents: readonly DeadlineDocument[];
  readonly signals: readonly DeadlineSignal[];
  readonly reminders: readonly DeadlineReminder[];
  readonly today: IsoDate;
}): DeadlineItem[] {
  // Validate the request date before doing any work, keeping all comparisons date-only.
  daysBetween(input.today, input.today);

  const signalsByDocument = new Map<string, DeadlineSignal[]>();
  for (const signal of input.signals) {
    const existing = signalsByDocument.get(signal.documentId) ?? [];
    existing.push(signal);
    signalsByDocument.set(signal.documentId, existing);
  }

  const documentItems = input.documents
    .map((document) =>
      buildDocumentItems(
        document,
        signalsByDocument.get(documentIdOf(document)) ?? [],
      ),
    )
    .flat();
  const merged = mergeReminders(documentItems, input.reminders);

  return merged
    .map((item) => withBucket(item, input.today))
    .filter((item): item is DeadlineItem => item !== null)
    .sort(compareDeadlineItems);
}

/** Recompute buckets and apply the same bounded dashboard window to existing items. */
export function filterDashboardWindow(
  items: readonly DeadlineItem[],
  today: IsoDate,
): DeadlineItem[] {
  return items
    .map((item) => withBucket(item, today))
    .filter((item): item is DeadlineItem => item !== null)
    .sort(compareDeadlineItems);
}

export const filterDeadlineItems = filterDashboardWindow;

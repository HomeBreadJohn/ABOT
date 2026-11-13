"use client";

import { ChevronRight } from "lucide-react";

import type { Finding } from "@/contracts/analysis";
import type { DocumentLifecycle } from "@/contracts/common";
import { categoryLabel } from "@/features/documents/presentation/labels";
import { cn } from "@/lib/utils";

import {
  CORRECTED_BASIS,
  daysUntil,
  formatDate,
  LIFECYCLE_LABEL,
  PROCESSING_LIFECYCLES,
  relativeDays,
  TRANSLATIONS,
  translationKey,
  type ProtoDoc,
} from "./data";
import { useStore } from "./store";

export const ATTENTION: ReadonlySet<DocumentLifecycle> = new Set([
  "NEEDS_CORRECTION",
  "REVIEW_REQUIRED",
  "OCR_FAILED",
  "ANALYSIS_FAILED",
]);

export function nextDeadline(d: ProtoDoc) {
  const dates = (d.analysis?.importantDates ?? [])
    .filter((x) => x.date && daysUntil(x.date) >= 0)
    .sort((a, b) => (a.date! < b.date! ? -1 : 1));
  return dates[0] ?? null;
}

/** How soon a deadline must land to count as "coming up". */
const DEADLINE_WINDOW_DAYS = 30;

/** Urgency order within the attention band: the most time-sensitive first. */
const ATTENTION_URGENCY: Partial<Record<DocumentLifecycle, number>> = {
  NEEDS_CORRECTION: 0,
  OCR_FAILED: 1,
  ANALYSIS_FAILED: 1,
  REVIEW_REQUIRED: 2,
};

/**
 * Sorts the vault into three plain bands so the reader meets the few documents
 * that need them before the settled pile. "needsYou" is anything mid-flow that
 * can't move without the reader; "comingUp" is a finished report with a
 * deadline near enough to matter; "ready" is everything already understood.
 * Within each band the order answers the reader's next question: how urgent,
 * then how soon, then how recent.
 */
export function groupVault(docs: ProtoDoc[]): {
  needsYou: ProtoDoc[];
  comingUp: ProtoDoc[];
  ready: ProtoDoc[];
} {
  const needsYou: ProtoDoc[] = [];
  const comingUp: ProtoDoc[] = [];
  const ready: ProtoDoc[] = [];

  for (const d of docs) {
    if (ATTENTION.has(d.lifecycle)) {
      needsYou.push(d);
      continue;
    }
    const due = nextDeadline(d);
    if (due?.date && daysUntil(due.date) <= DEADLINE_WINDOW_DAYS) {
      comingUp.push(d);
      continue;
    }
    ready.push(d);
  }

  needsYou.sort(
    (a, b) =>
      (ATTENTION_URGENCY[a.lifecycle] ?? 9) -
      (ATTENTION_URGENCY[b.lifecycle] ?? 9),
  );
  comingUp.sort((a, b) => {
    const da = nextDeadline(a)?.date ?? "";
    const db = nextDeadline(b)?.date ?? "";
    return da < db ? -1 : da > db ? 1 : 0;
  });
  ready.sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1));

  return { needsYou, comingUp, ready };
}

/** The single plain line that says why a document sits in the attention band. */
export function vaultAttentionReason(d: ProtoDoc): string {
  const required =
    d.analysis?.reviewRequirements.filter((r) => r.reviewStatus === "REQUIRED") ??
    [];
  switch (d.lifecycle) {
    case "NEEDS_CORRECTION":
      return `We couldn't read the ${
        required[0]?.field.toLowerCase() ?? "key details"
      } clearly. Check it before you act.`;
    case "REVIEW_REQUIRED":
      return required.length
        ? `Please confirm the ${required
            .map((r) => r.field.toLowerCase())
            .join(" and ")} we read.`
        : "Ready for your review.";
    case "OCR_FAILED":
      return "We couldn't read this file. You can try again.";
    case "ANALYSIS_FAILED":
      return "We couldn't prepare this report. You can try again.";
    default:
      return "";
  }
}

export function StatusPill({ lifecycle }: { lifecycle: DocumentLifecycle }) {
  const processing = PROCESSING_LIFECYCLES.has(lifecycle);
  const failed = lifecycle === "OCR_FAILED" || lifecycle === "ANALYSIS_FAILED";
  const review = lifecycle === "NEEDS_CORRECTION" || lifecycle === "REVIEW_REQUIRED";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-sm font-semibold whitespace-nowrap",
        processing && "bg-(--low-wash) text-(--ink-2)",
        failed && "bg-(--critical-wash) text-(--critical)",
        review && "bg-(--high-wash) text-(--high)",
        lifecycle === "COMPLETED" && "bg-(--care-wash) text-(--care-strong)",
      )}
    >
      {processing ? (
        <span className="pulse-dot size-2 rounded-full bg-current" aria-hidden />
      ) : null}
      {LIFECYCLE_LABEL[lifecycle]}
    </span>
  );
}

export function DocRow({
  doc,
  onOpen,
  leading,
  reason,
}: {
  doc: ProtoDoc;
  onOpen: () => void;
  leading?: React.ReactNode;
  reason?: string;
}) {
  const due = nextDeadline(doc);
  return (
    <li className="flex items-stretch border-b border-(--line) last:border-b-0">
      {leading}
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3.5 text-left hover:bg-(--canvas)"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{doc.title}</p>
          <p className="mt-0.5 flex flex-wrap gap-x-3 text-sm text-(--ink-3)">
            <span>{categoryLabel(doc.category)}</span>
            <span>Added {formatDate(doc.uploadedAt)}</span>
            {due ? (
              <span className={cn(daysUntil(due.date!) <= 7 && "font-semibold text-(--high)")}>
                {due.title}: {relativeDays(due.date!).toLowerCase()}
              </span>
            ) : null}
          </p>
          {reason ? <p className="mt-1 text-[0.9375rem] text-(--ink-2)">{reason}</p> : null}
        </div>
        <StatusPill lifecycle={doc.lifecycle} />
        <ChevronRight className="size-5 shrink-0 text-(--ink-3)" aria-hidden />
      </button>
    </li>
  );
}

/** User-facing copy in the chosen language. Structured analysis is never re-run. */
export function useCopy(doc: ProtoDoc) {
  const { state } = useStore();
  const t = TRANSLATIONS[translationKey(doc)]?.[state.language];
  const a = doc.analysis;
  return {
    language: state.language,
    overview: t?.overview ?? a?.overview ?? "",
    explanation: t?.explanation ?? a?.explanation ?? "",
    finding<F extends Pick<Finding, "id" | "title" | "explanation" | "basis">>(f: F) {
      if (f.basis === CORRECTED_BASIS) return { title: f.title, explanation: f.explanation };
      return t?.findings?.[f.id] ?? { title: f.title, explanation: f.explanation };
    },
  };
}

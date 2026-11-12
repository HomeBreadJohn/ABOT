"use client";

import { ChevronRight } from "lucide-react";

import type { Finding } from "@/contracts/analysis";
import type { DocumentLifecycle } from "@/contracts/common";
import { cn } from "@/lib/utils";

import {
  CATEGORY_LABEL,
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
            <span>{doc.category ? CATEGORY_LABEL[doc.category] : "Not sorted yet"}</span>
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

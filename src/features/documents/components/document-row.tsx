import Link from "next/link";

import { StatusPill } from "@/components/ui/status-pill";
import {
  deadlineDateCue,
  formatDateOnly,
  type DocumentCardView,
} from "@/features/documents/view-models";

function formatNextDate(view: DocumentCardView): string {
  if (!view.nextDate) {
    return "No dates found yet";
  }

  const dates = view.nextDate.dates.length
    ? view.nextDate.dates.map((date) => formatDateOnly(date)).join(" or ")
    : (deadlineDateCue(view.nextDate) ?? "Date unclear");

  return `${view.nextDate.title}: ${dates}`;
}

function DocumentRow({ view }: { view: DocumentCardView }) {
  const categoryDetails = [view.category.label, view.subtype]
    .filter(Boolean)
    .join(" · ");
  const secondaryDetail = view.failureReason
    ? `Failure reason: ${view.failureReason}`
    : `Next date: ${formatNextDate(view)}`;
  const headingId = `document-row-${view.id}-title`;

  return (
    <li className="bg-surface border-hairline ease-standard hover:bg-surface-hover relative rounded-xl border transition-colors duration-150">
      <Link
        href={view.href}
        aria-labelledby={headingId}
        className="focus-visible:outline-focus absolute inset-0 z-10 rounded-xl outline-none focus-visible:outline-2 focus-visible:outline-offset-3"
      >
        <span className="sr-only">Open {view.title}</span>
      </Link>

      <div className="pointer-events-none relative grid gap-4 px-4 py-4 sm:px-5 sm:py-5 md:grid-cols-[minmax(0,1.8fr)_minmax(10rem,1fr)_minmax(10rem,1fr)_minmax(11rem,1.2fr)] md:items-center md:gap-5">
        <div className="min-w-0">
          <h2
            id={headingId}
            className="text-body text-ink truncate font-semibold sm:text-lg"
          >
            {view.title}
          </h2>
          <p className="text-body-sm text-ink-muted mt-1 truncate">
            {categoryDetails}
          </p>
          <p className="text-caption text-ink-subtle mt-1">
            Added {view.uploadedAt.label}
          </p>
        </div>

        <div className="hidden min-w-0 md:block">
          <p className="text-caption text-ink-subtle mb-1">Processing</p>
          <StatusPill
            tone={view.status.tone}
            label={view.status.label}
            title={view.status.description}
          />
        </div>

        <div className="min-w-0">
          <p className="text-caption text-ink-subtle mb-1">Analysis</p>
          <StatusPill
            tone={view.analysis.tone}
            label={view.analysis.label}
            title={view.analysis.description}
          />
        </div>

        <div className="text-body-sm text-ink-muted min-w-0">
          <p className="text-caption text-ink-subtle mb-1 md:hidden">
            Processing
          </p>
          <div className="md:hidden">
            <StatusPill
              tone={view.status.tone}
              label={view.status.label}
              title={view.status.description}
            />
          </div>
          <p className="mt-3 md:mt-0">{secondaryDetail}</p>
          {view.nextDate?.certainty === "CONFLICTING" ? (
            <p className="text-caption text-tone-caution-fg mt-1">
              Different dates found
            </p>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export { DocumentRow };

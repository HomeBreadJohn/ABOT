import * as React from "react";

import {
  adaptPresentationValue,
  UNKNOWN_PRESENTATION_VALUE,
  type PresentationCategory,
  type PresentationView,
} from "@/lib/presentation";
import { cn } from "@/lib/utils";

const toneClasses: Record<PresentationView["tone"], string> = {
  neutral: "border-slate-300 bg-slate-50 text-slate-700",
  positive: "border-emerald-300 bg-emerald-50 text-emerald-800",
  informative: "border-sky-300 bg-sky-50 text-sky-800",
  caution: "border-amber-300 bg-amber-50 text-amber-900",
  critical: "border-rose-300 bg-rose-50 text-rose-800",
};

type PresentationValueBaseProps = Omit<
  React.ComponentPropsWithoutRef<"span">,
  "children"
>;

export type PresentationValueProps = PresentationValueBaseProps &
  (
    | {
        category: PresentationCategory;
        value: unknown;
        presentation?: never;
      }
    | {
        category?: never;
        value?: never;
        presentation: PresentationView;
      }
  );

function PresentationValue({
  category,
  className,
  presentation,
  value,
  ...props
}: PresentationValueProps) {
  const adaptedView =
    presentation ??
    (category
      ? adaptPresentationValue({ category, value })
      : UNKNOWN_PRESENTATION_VALUE);
  const view = adaptedView.supported ? adaptedView : UNKNOWN_PRESENTATION_VALUE;
  const accessibleLabel = view.categoryLabel
    ? `${view.categoryLabel}: ${view.label}`
    : view.label;

  return (
    <span
      aria-label={props["aria-label"] ?? accessibleLabel}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium",
        toneClasses[view.tone],
        className,
      )}
      data-slot="presentation-value"
      data-supported={view.supported}
      {...props}
    >
      {view.categoryLabel ? (
        <span
          className="border-r border-current/30 pr-2 text-xs font-semibold tracking-wide uppercase"
          data-slot="presentation-category"
        >
          {view.categoryLabel}
        </span>
      ) : null}
      <span
        aria-hidden="true"
        className="font-semibold"
        data-slot="presentation-cue"
      >
        {view.cue}
      </span>
      <span data-slot="presentation-label">{view.label}</span>
    </span>
  );
}

export { PresentationValue };

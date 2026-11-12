import * as React from "react";

import {
  adaptPresentationValue,
  UNKNOWN_PRESENTATION_VALUE,
  type PresentationCategory,
  type PresentationView,
} from "@/lib/presentation";
import { cn } from "@/lib/utils";

const toneClasses: Record<PresentationView["tone"], string> = {
  neutral: "border-tone-neutral-border bg-tone-neutral-bg text-tone-neutral-fg",
  positive:
    "border-tone-positive-border bg-tone-positive-bg text-tone-positive-fg",
  informative:
    "border-tone-informative-border bg-tone-informative-bg text-tone-informative-fg",
  caution: "border-tone-caution-border bg-tone-caution-bg text-tone-caution-fg",
  critical:
    "border-tone-critical-border bg-tone-critical-bg text-tone-critical-fg",
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
        "text-body-sm inline-flex items-center gap-2 rounded-md border px-3 py-1.5 font-medium",
        toneClasses[view.tone],
        className,
      )}
      data-slot="presentation-value"
      data-supported={view.supported}
      {...props}
    >
      {view.categoryLabel ? (
        <span
          className="text-caption border-r border-current/30 pr-2 font-semibold tracking-wide uppercase"
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

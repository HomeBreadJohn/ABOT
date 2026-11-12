import * as React from "react";

import type { PresentationTone } from "@/lib/presentation";
import { cn } from "@/lib/utils";

const toneLabels: Record<PresentationTone, string> = {
  neutral: "Neutral status",
  informative: "Informative status",
  positive: "Positive status",
  caution: "Caution status",
  critical: "Critical status",
};

export interface StatusShapeProps extends Omit<
  React.ComponentPropsWithoutRef<"svg">,
  "children"
> {
  tone: PresentationTone;
  label?: React.ReactNode;
  size?: "sm" | "md";
}

function StatusShape({
  className,
  label,
  size = "md",
  tone,
  ...props
}: StatusShapeProps) {
  const iconClassName = cn(
    "shrink-0 text-current",
    size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4",
    className,
  );

  return (
    <>
      <svg
        {...props}
        aria-hidden="true"
        className={iconClassName}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        focusable="false"
        data-slot="status-shape"
      >
        {tone === "neutral" ? <circle cx="12" cy="12" r="8.5" /> : null}
        {tone === "informative" ? (
          <>
            <path
              d="M12 3.5a8.5 8.5 0 0 0 0 17V3.5Z"
              fill="currentColor"
              stroke="none"
            />
            <circle cx="12" cy="12" r="8.5" />
          </>
        ) : null}
        {tone === "positive" ? (
          <>
            <circle cx="12" cy="12" r="8.5" fill="currentColor" />
            <path d="m8.2 12.2 2.3 2.3 5.3-5.3" stroke="var(--on-accent)" />
          </>
        ) : null}
        {tone === "caution" ? (
          <path d="m12 3.5 9 16H3l9-16Z" fill="currentColor" />
        ) : null}
        {tone === "critical" ? (
          <path
            d="m12 3.5 8.5 8.5-8.5 8.5L3.5 12 12 3.5Z"
            fill="currentColor"
          />
        ) : null}
      </svg>
      {label ? <span className="sr-only">{label}</span> : null}
    </>
  );
}

export { StatusShape, toneLabels };

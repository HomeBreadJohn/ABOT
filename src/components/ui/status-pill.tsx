import * as React from "react";

import type { PresentationTone } from "@/lib/presentation";
import { cn } from "@/lib/utils";
import { StatusShape } from "@/components/ui/status-shape";

const toneClasses: Record<PresentationTone, string> = {
  neutral: "border-tone-neutral-border bg-tone-neutral-bg text-tone-neutral-fg",
  positive:
    "border-tone-positive-border bg-tone-positive-bg text-tone-positive-fg",
  informative:
    "border-tone-informative-border bg-tone-informative-bg text-tone-informative-fg",
  caution: "border-tone-caution-border bg-tone-caution-bg text-tone-caution-fg",
  critical:
    "border-tone-critical-border bg-tone-critical-bg text-tone-critical-fg",
};

export interface StatusPillProps extends React.ComponentPropsWithoutRef<"span"> {
  tone: PresentationTone;
  label?: React.ReactNode;
}

function StatusPill({
  children,
  className,
  label,
  tone,
  ...props
}: StatusPillProps) {
  const content = label ?? children;

  return (
    <span
      {...props}
      className={cn(
        "text-caption inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium",
        toneClasses[tone],
        className,
      )}
      data-slot="status-pill"
    >
      <StatusShape tone={tone} size="sm" />
      <span data-slot="status-label">{content}</span>
    </span>
  );
}

export { StatusPill };

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-caption font-medium",
  {
    variants: {
      variant: {
        neutral:
          "border-tone-neutral-border bg-tone-neutral-bg text-tone-neutral-fg",
        success:
          "border-tone-positive-border bg-tone-positive-bg text-tone-positive-fg",
        warning:
          "border-tone-caution-border bg-tone-caution-bg text-tone-caution-fg",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

export interface BadgeProps
  extends React.ComponentProps<"span">, VariantProps<typeof badgeVariants> {
  cue?: React.ReactNode;
  showCue?: boolean;
}

function Badge({
  className,
  variant,
  cue,
  showCue = true,
  children,
  ...props
}: BadgeProps) {
  const cueContent =
    cue ?? (variant === "success" ? "✓" : variant === "warning" ? "!" : "•");

  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {showCue ? (
        <span aria-hidden="true" className="font-semibold">
          {cueContent}
        </span>
      ) : null}
      {children}
    </span>
  );
}

export { Badge, badgeVariants };

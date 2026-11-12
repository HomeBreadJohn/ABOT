import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
  {
    variants: {
      variant: {
        neutral: "border-slate-300 bg-slate-100 text-slate-700",
        success: "border-emerald-300 bg-emerald-50 text-emerald-800",
        warning: "border-amber-400 bg-amber-50 text-amber-900",
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

import * as React from "react";

import { cn } from "@/lib/utils";

export type FormMessageVariant = "error" | "success" | "status";

export interface FormMessageProps extends React.ComponentProps<"p"> {
  variant?: FormMessageVariant;
}

function FormMessage({
  className,
  children,
  variant = "status",
  ...props
}: FormMessageProps) {
  const isError = variant === "error";
  const cue = isError ? "!" : variant === "success" ? "✓" : "i";

  return (
    <p
      {...props}
      className={cn(
        "text-body-sm flex items-start gap-2 rounded-md border px-3 py-2",
        isError
          ? "border-tone-critical-border bg-tone-critical-bg text-tone-critical-fg"
          : variant === "success"
            ? "border-tone-positive-border bg-tone-positive-bg text-tone-positive-fg"
            : "border-tone-neutral-border bg-tone-neutral-bg text-tone-neutral-fg",
        className,
      )}
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      aria-atomic="true"
    >
      <span
        aria-hidden="true"
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current font-semibold"
      >
        {cue}
      </span>
      <span>{children}</span>
    </p>
  );
}

export { FormMessage };

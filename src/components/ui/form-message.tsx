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
        "flex items-start gap-2 rounded-lg border px-3 py-2 text-sm",
        isError
          ? "border-rose-200 bg-rose-50 text-rose-800"
          : variant === "success"
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-slate-200 bg-slate-50 text-slate-700",
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

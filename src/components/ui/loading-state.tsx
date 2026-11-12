import * as React from "react";

import { cn } from "@/lib/utils";

export interface LoadingStateProps extends React.ComponentProps<"div"> {
  label?: React.ReactNode;
}

function LoadingState({
  className,
  label = "Loading…",
  ...props
}: LoadingStateProps) {
  return (
    <div
      {...props}
      className={cn(
        "flex items-center gap-3 rounded-lg border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-700",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-atomic="true"
    >
      <span
        aria-hidden="true"
        className="h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-transparent"
      />
      <span>{label}</span>
    </div>
  );
}

export { LoadingState };

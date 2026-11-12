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
        "border-hairline bg-surface-sunken text-body-sm text-ink-muted flex items-center gap-3 rounded-md border px-4 py-3",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-atomic="true"
    >
      <span
        aria-hidden="true"
        className="border-tone-informative-fg h-4 w-4 animate-spin rounded-full border-2 border-t-transparent"
      />
      <span>{label}</span>
    </div>
  );
}

export { LoadingState };

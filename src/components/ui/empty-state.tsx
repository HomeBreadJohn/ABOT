import * as React from "react";

import { cn } from "@/lib/utils";

export interface EmptyStateProps extends Omit<
  React.ComponentProps<"section">,
  "title"
> {
  title: React.ReactNode;
  description: React.ReactNode;
  action?: React.ReactNode;
}

function EmptyState({
  className,
  title,
  description,
  action,
  ...props
}: EmptyStateProps) {
  const headingId = React.useId();

  return (
    <section
      {...props}
      aria-labelledby={headingId}
      className={cn(
        "border-strong bg-surface-sunken flex flex-col items-center justify-center rounded-lg border border-dashed px-4 py-8 text-center sm:px-6 sm:py-10",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="border-strong text-ink-muted mb-4 inline-flex h-10 w-10 items-center justify-center rounded-full border text-lg font-semibold"
      >
        ···
      </span>
      <h2 id={headingId} className="text-heading text-ink tracking-tight">
        {title}
      </h2>
      <p className="text-body-sm text-ink-muted mt-2 max-w-md">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </section>
  );
}

export { EmptyState };

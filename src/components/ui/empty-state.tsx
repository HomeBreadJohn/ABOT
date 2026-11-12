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
        className="border-hairline bg-surface text-ink-subtle shadow-soft mb-4 inline-flex h-11 w-11 items-center justify-center rounded-full border text-lg font-semibold"
      >
        ···
      </span>
      <h2
        id={headingId}
        className="text-heading text-ink tracking-tight text-balance"
      >
        {title}
      </h2>
      <p className="text-body-sm text-ink-muted mt-2 max-w-md text-pretty">
        {description}
      </p>
      {action ? <div className="mt-5">{action}</div> : null}
    </section>
  );
}

export { EmptyState };

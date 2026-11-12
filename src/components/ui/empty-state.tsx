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
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-400 bg-slate-50 px-4 py-8 text-center sm:px-6 sm:py-10",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 text-lg font-semibold text-slate-600"
      >
        ···
      </span>
      <h2
        id={headingId}
        className="text-lg font-semibold tracking-tight text-slate-950"
      >
        {title}
      </h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-slate-600">
        {description}
      </p>
      {action ? <div className="mt-5">{action}</div> : null}
    </section>
  );
}

export { EmptyState };

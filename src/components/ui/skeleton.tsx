import * as React from "react";

import { cn } from "@/lib/utils";

export type SkeletonProps = React.ComponentPropsWithoutRef<"div">;

function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      {...props}
      aria-hidden="true"
      className={cn(
        "bg-surface-sunken rounded-md motion-safe:animate-pulse",
        className,
      )}
      data-slot="skeleton"
    />
  );
}

export { Skeleton };

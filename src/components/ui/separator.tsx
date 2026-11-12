import * as React from "react";

import { cn } from "@/lib/utils";

export interface SeparatorProps extends React.ComponentProps<"div"> {
  orientation?: "horizontal" | "vertical";
  decorative?: boolean;
}

function Separator({
  className,
  orientation = "horizontal",
  decorative = true,
  ...props
}: SeparatorProps) {
  return (
    <div
      {...props}
      role={decorative ? undefined : "separator"}
      aria-hidden={decorative ? true : undefined}
      aria-orientation={decorative ? undefined : orientation}
      className={cn(
        "bg-hairline shrink-0",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className,
      )}
    />
  );
}

export { Separator };

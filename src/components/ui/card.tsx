import * as React from "react";

import { cn } from "@/lib/utils";

function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "border-hairline bg-surface shadow-soft rounded-lg border",
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-col gap-1.5 p-4 sm:p-5", className)}
      {...props}
    />
  );
}

interface CardTitleProps extends React.ComponentProps<"h3"> {
  as?: "h2" | "h3" | "h4";
}

function CardTitle({
  as: Heading = "h3",
  className,
  ...props
}: CardTitleProps) {
  return (
    <Heading
      className={cn("text-subhead text-ink tracking-tight", className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p className={cn("text-body-sm text-ink-muted", className)} {...props} />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("p-4 pt-0 sm:p-5 sm:pt-0", className)} {...props} />
  );
}

export { Card, CardContent, CardDescription, CardHeader, CardTitle };

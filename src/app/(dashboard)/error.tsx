"use client";

import { Button } from "@/components/ui/button";

export default function DashboardError({
  retry,
}: Readonly<{
  retry: () => void;
}>) {
  return (
    <div className="border-tone-critical-border bg-tone-critical-bg text-tone-critical-fg mx-auto w-full max-w-xl rounded-xl border p-4 text-center sm:p-6">
      <h1 className="text-lg font-semibold">
        {"We couldn't load this workspace"}
      </h1>
      <p className="text-body-sm mt-2">
        Please try again. If the issue continues, check your connection and try
        again later.
      </p>
      <Button className="mt-5" onClick={() => retry()}>
        Try again
      </Button>
    </div>
  );
}

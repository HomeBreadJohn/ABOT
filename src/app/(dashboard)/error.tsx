"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function DashboardError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Keep sensitive server errors out of the browser and application logs.
  }, []);

  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-danger/25 bg-danger/8 p-6 text-center">
      <h1 className="text-lg font-semibold text-ink-950">
        We could not load this workspace
      </h1>
      <p className="mt-2 text-sm text-ink-600">
        Try again. If the issue continues, check the application configuration.
      </p>
      <Button className="mt-5" onClick={() => reset()}>
        Try again
      </Button>
    </div>
  );
}

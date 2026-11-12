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
    <div className="mx-auto w-full max-w-xl rounded-2xl border border-rose-300 bg-rose-50 p-4 text-center sm:p-6">
      <h1 className="text-lg font-semibold text-rose-950">
        We could not load this workspace
      </h1>
      <p className="mt-2 text-sm text-rose-900">
        Try again. If the issue continues, check the application configuration.
      </p>
      <Button className="mt-5" onClick={() => reset()}>
        Try again
      </Button>
    </div>
  );
}

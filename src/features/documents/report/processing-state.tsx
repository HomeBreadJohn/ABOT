"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import { lifecycleToStage, type DocumentLifecycle } from "@/contracts/common";
import { presentDocumentStatus } from "@/features/documents/view-models";

const STAGE_LABELS: Record<
  ReturnType<typeof lifecycleToStage>,
  string
> = {
  RECEIVED: "Received",
  READING: "Reading",
  UNDERSTANDING: "Understanding",
  CHECKING_DETAILS: "Checking details",
  PREPARING_REPORT: "Preparing report",
};

function isFailed(lifecycle: DocumentLifecycle): boolean {
  return lifecycle === "OCR_FAILED" || lifecycle === "ANALYSIS_FAILED";
}

export function ProcessingState({
  lifecycle,
  jobStep,
}: {
  lifecycle: DocumentLifecycle;
  jobStep?: number;
}) {
  // shortcut: Try again only flips local state for the demo, when wired it
  // should POST a reprocess request and poll the document lifecycle.
  const [retried, setRetried] = useState(false);
  const status = presentDocumentStatus(lifecycle);

  if (isFailed(lifecycle) && !retried) {
    return (
      <EmptyState
        role="region"
        aria-label="Processing failed"
        title={status.label}
        description={status.description}
        action={
          <Button type="button" onClick={() => setRetried(true)}>
            Try again
          </Button>
        }
      />
    );
  }

  const stage = lifecycleToStage(lifecycle, jobStep);

  return (
    <Card>
      <CardContent className="grid gap-3 pt-4 sm:pt-5">
        <StatusPill
          tone={status.tone}
          label={status.label}
          className="justify-self-start"
        />
        <progress
          className="accent-accent h-2 w-full overflow-hidden rounded-full"
          aria-label={`${STAGE_LABELS[stage]} your document`}
        />
        <p className="text-body-sm text-ink-muted" aria-live="polite">
          {STAGE_LABELS[stage]}… this can take a little while.
        </p>
      </CardContent>
    </Card>
  );
}

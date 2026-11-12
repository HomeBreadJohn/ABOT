"use client";

import * as React from "react";
import Link from "next/link";
import { CircleAlert, FileText, RotateCcw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusShape } from "@/components/ui/status-shape";
import type { ApiErrorCode } from "@/contracts/api-error";
import type { FileRejectionReason } from "@/features/documents/upload/upload-helpers";
import {
  getUploadProgressPercentage,
  type UploadItem,
  type UploadPhase,
} from "@/features/documents/upload/upload-queue";
import { cn } from "@/lib/utils";

const phaseLabels: Record<UploadPhase["kind"], string> = {
  rejected: "Not uploaded",
  queued: "Ready to upload",
  preparing: "Preparing upload",
  uploading: "Uploading",
  finalizing: "Saving document",
  done: "Document received",
  failed: "Upload failed",
};

const phaseTones: Record<
  UploadPhase["kind"],
  "neutral" | "informative" | "positive" | "caution" | "critical"
> = {
  rejected: "caution",
  queued: "neutral",
  preparing: "informative",
  uploading: "informative",
  finalizing: "informative",
  done: "positive",
  failed: "critical",
};

const rejectionMessages: Record<FileRejectionReason, string> = {
  UNSUPPORTED_TYPE: "This file format is not supported. Choose another file.",
  EMPTY_FILE: "This file is empty. Choose another file.",
  FILE_TOO_LARGE: "This file is too large. Choose a file up to 10 MB.",
  DUPLICATE: "This file is already in the upload list.",
  TOO_MANY_FILES:
    "The upload list is full. Upload these files first, then add more.",
  CONTENT_MISMATCH:
    "The file contents do not match its file type. Choose another file.",
};

const failureMessages: Record<ApiErrorCode | "NETWORK", string> = {
  UNAUTHENTICATED: "Your session ended. Continue after signing in.",
  FORBIDDEN: "You cannot upload this file. Sign in again and try again.",
  NOT_FOUND: "The upload could not be found. Try again.",
  INVALID_REQUEST: "This file could not be accepted. Choose another file.",
  CONFLICT: "This upload conflicts with another request. Remove it and try again.",
  NOT_READY: "This upload is not ready yet. Try again.",
  UNSUPPORTED_FILE:
    "The file contents do not match its file type. Choose another file.",
  RATE_LIMITED: "Too many uploads were attempted. Wait a moment and try again.",
  PROVIDER_UNAVAILABLE:
    "The upload service is unavailable right now. Try again.",
  INVALID_ANALYSIS: "This file could not be saved. Remove it and try again.",
  INTERNAL_ERROR: "We could not save this file. Try again or remove it.",
  NETWORK: "The connection was interrupted. Try again.",
};

const statusBorderClasses: Record<
  UploadPhase["kind"],
  string
> = {
  rejected: "border-tone-caution-border",
  queued: "border-tone-neutral-border",
  preparing: "border-tone-informative-border",
  uploading: "border-tone-informative-border",
  finalizing: "border-tone-informative-border",
  done: "border-tone-positive-border",
  failed: "border-tone-critical-border",
};

export interface QueuedFileChipProps {
  readonly item: UploadItem;
  readonly onRetry: (itemId: string) => void;
  readonly onRemove: (itemId: string) => void;
  readonly className?: string;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "Unknown size";
  }

  if (bytes < 1024) {
    return `${Math.round(bytes)} B`;
  }

  const units = ["KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = -1;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 100 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function getErrorMessage(phase: UploadPhase): string | null {
  if (phase.kind === "rejected") {
    return rejectionMessages[phase.reason];
  }

  if (phase.kind === "failed") {
    return failureMessages[phase.code];
  }

  return null;
}

function getUploadProgressText(phase: Extract<UploadPhase, { kind: "uploading" }>): string {
  if (phase.total === null || phase.total <= 0) {
    return "Uploading…";
  }

  const percentage = getUploadProgressPercentage(phase);
  const percentText = percentage === null ? "" : ` · ${percentage}% uploaded`;

  return `${formatBytes(phase.loaded)} of ${formatBytes(phase.total)}${percentText}`;
}

function QueuedFileChip({
  className,
  item,
  onRemove,
  onRetry,
}: QueuedFileChipProps) {
  const titleId = React.useId();
  const phaseId = React.useId();
  const errorId = React.useId();
  const { phase } = item;
  const errorMessage = getErrorMessage(phase);
  const isRetryable = phase.kind === "failed" && phase.retryable;
  const progress = phase.kind === "uploading" ? getUploadProgressPercentage(phase) : null;

  return (
    <Card
      aria-describedby={errorMessage ? errorId : phaseId}
      aria-labelledby={titleId}
      className={cn(
        "flex flex-col gap-3 p-3 sm:p-4",
        statusBorderClasses[phase.kind],
        className,
      )}
      data-phase={phase.kind}
      data-slot="queued-file-chip"
      role="group"
    >
      <div className="flex min-w-0 items-start gap-3">
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface-sunken text-ink-muted"
        >
          <FileText className="h-5 w-5" strokeWidth={1.75} />
        </span>

        <div className="min-w-0 flex-1">
          <p
            className="truncate text-body-sm font-medium text-ink"
            id={titleId}
            title={item.displayName}
          >
            {item.displayName}
          </p>
          <p className="text-caption text-ink-subtle">
            {formatBytes(item.file.size)}
            {item.mimeType ? ` · ${item.mimeType}` : ""}
          </p>
        </div>

        <span
          className="inline-flex shrink-0 items-center gap-1.5 text-body-sm font-medium text-ink"
          id={phaseId}
          role="status"
          aria-live="polite"
        >
          <StatusShape tone={phaseTones[phase.kind]} size="sm" />
          <span className="sr-only">Upload phase: </span>
          {phaseLabels[phase.kind]}
        </span>
      </div>

      {phase.kind === "uploading" ? (
        <div className="space-y-1.5">
          <progress
            aria-label={`Upload progress for ${item.displayName}`}
            aria-valuetext={
              progress === null ? "Uploading" : `${progress} percent uploaded`
            }
            className="h-2 w-full overflow-hidden rounded-full accent-accent"
            max={phase.total ?? undefined}
            value={phase.total === null ? undefined : phase.loaded}
          />
          <p className="text-caption text-ink-muted">
            {getUploadProgressText(phase)}
          </p>
        </div>
      ) : null}

      {errorMessage ? (
        <div
          className="flex items-start gap-2 text-body-sm text-tone-critical-fg"
          id={errorId}
          role="alert"
        >
          <CircleAlert
            aria-hidden="true"
            className="mt-0.5 h-4 w-4 shrink-0"
            strokeWidth={1.75}
          />
          <p>
            {errorMessage}
            {phase.kind === "failed" && phase.code === "UNAUTHENTICATED" ? (
              <>
                {" "}
                <Link
                  className="font-medium underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-focus"
                  href="/login?reason=session-expired"
                >
                  Sign in again
                </Link>
                .
              </>
            ) : null}
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {isRetryable ? (
          <Button
            aria-label={`Retry upload for ${item.displayName}`}
            onClick={() => onRetry(item.id)}
            size="sm"
            type="button"
            variant="secondary"
          >
            <RotateCcw aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
            <span>Retry</span>
          </Button>
        ) : null}
        <Button
          aria-label={`Remove ${item.displayName} from the upload list`}
          onClick={() => onRemove(item.id)}
          size="sm"
          type="button"
          variant="ghost"
        >
          <X aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
          <span>Remove</span>
        </Button>
      </div>
    </Card>
  );
}

export { QueuedFileChip, formatBytes };

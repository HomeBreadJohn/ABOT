import type { DocumentLifecycle } from "@/contracts";

type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [key: string]: Json };

export type JobType =
  | "OCR_SUBMIT"
  | "OCR_POLL"
  | "OCR_FETCH"
  | "ANALYZE"
  | "REANALYZE"
  | "TRANSLATE"
  | "CROSS_ANALYZE";

/** A job leased from the queue, ready to run. */
export type ClaimedJob = {
  id: string;
  documentId: string;
  userId: string;
  jobType: JobType;
  step: number | null;
  payload: Json;
  attempts: number;
  maxAttempts: number;
};

/** What a handler needs beyond the job row. Extended by later tasks. */
export type JobContext = Record<string, never>;

/** A new job to enqueue (used for follow-ups and by callers). */
export type EnqueueInput = {
  documentId: string;
  userId: string;
  type: JobType;
  idempotencyKey: string;
  payload?: Json;
};

export type JobOutcome =
  | { kind: "done"; next?: EnqueueInput[] }
  | { kind: "retry"; afterMs: number; reason: string }
  | { kind: "fail"; errorCode: string };

export type JobHandler = (
  job: ClaimedJob,
  ctx: JobContext,
) => Promise<JobOutcome>;

const handlers = new Map<JobType, JobHandler>();

export function registerJobHandler(type: JobType, handler: JobHandler): void {
  handlers.set(type, handler);
}

export function getJobHandler(type: JobType): JobHandler | undefined {
  return handlers.get(type);
}

// Re-export so handler modules can import the lifecycle type from one place.
export type { DocumentLifecycle, Json };

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getJobRunnerSecret } from "@/lib/env/server";
import { logger } from "@/lib/logging/logger";
import {
  type ClaimedJob,
  type EnqueueInput,
  type Json,
  type JobType,
  getJobHandler,
} from "@/features/processing/services/job-registry";

const LEASE_SECONDS = 90;
const TICK_BUDGET_MS = 45_000;
/** Exponential backoff base; attempt n waits BASE * 4^(n-1) ms (5s, 20s, 80s). */
const BACKOFF_BASE_MS = 5_000;

/** In-memory shape of a queued job; the DB store maps rows to/from this. */
export type StoredJob = {
  id: string;
  documentId: string;
  userId: string;
  jobType: JobType;
  step: number | null;
  payload: Json;
  idempotencyKey: string;
  status: "queued" | "RETRY_SCHEDULED" | "processing" | "completed" | "failed";
  runAfter: number;
  leaseExpiresAt: number | null;
  attempts: number;
  maxAttempts: number;
  errorCode: string | null;
};

/**
 * The seam between the runner and storage. One real impl (createDbJobStore)
 * and an in-memory fake in the unit tests.
 */
export interface JobStore {
  enqueue(input: EnqueueInput): Promise<{ jobId: string; created: boolean }>;
  claim(leaseSeconds: number): Promise<ClaimedJob | null>;
  complete(jobId: string): Promise<void>;
  /** Schedule the next attempt `delayMs` from now; the store owns the clock. */
  scheduleRetry(
    jobId: string,
    delayMs: number,
    errorCode?: string,
  ): Promise<void>;
  fail(jobId: string, errorCode: string): Promise<void>;
}

/** Idempotent enqueue. An existing idempotency key inserts nothing. */
export async function enqueueJob(
  input: EnqueueInput,
  store: JobStore = createDbJobStore(),
): Promise<{ jobId: string; created: boolean }> {
  return store.enqueue(input);
}

/**
 * Claim and run due jobs one at a time until the time budget is spent or
 * nothing is claimable. Applies each handler's outcome.
 */
export async function runDueJobs(
  budgetMs: number,
  store: JobStore = createDbJobStore(),
  now: () => number = Date.now,
): Promise<{ ran: number }> {
  const deadline = now() + budgetMs;
  let ran = 0;

  while (now() < deadline) {
    const job = await store.claim(LEASE_SECONDS);
    if (!job) break;
    ran += 1;
    await runOne(job, store);
  }

  return { ran };
}

async function runOne(job: ClaimedJob, store: JobStore): Promise<void> {
  const handler = getJobHandler(job.jobType);
  if (!handler) {
    await store.fail(job.id, "NO_HANDLER");
    return;
  }

  let outcome;
  try {
    outcome = await handler(job, {});
  } catch {
    // Never log the error message, stack, or payload: only allowlisted keys.
    logger.error("job handler threw", {
      jobId: job.id,
      jobType: job.jobType,
      errorCode: "HANDLER_ERROR",
    });
    await retryOrFail(job, store, "HANDLER_ERROR");
    return;
  }

  if (outcome.kind === "done") {
    for (const next of outcome.next ?? []) await store.enqueue(next);
    await store.complete(job.id);
    return;
  }
  if (outcome.kind === "retry") {
    await retryOrFail(job, store, undefined);
    return;
  }
  await store.fail(job.id, outcome.errorCode);
}

/** Schedule the next attempt with exponential backoff, or fail at the cap. */
async function retryOrFail(
  job: ClaimedJob,
  store: JobStore,
  errorCode: string | undefined,
): Promise<void> {
  if (job.attempts >= job.maxAttempts) {
    await store.fail(job.id, "MAX_ATTEMPTS");
    return;
  }
  const delayMs = BACKOFF_BASE_MS * Math.pow(4, job.attempts - 1);
  await store.scheduleRetry(job.id, delayMs, errorCode);
}

/**
 * Fire the tick route without blocking the current response. `origin` comes
 * from the incoming request (e.g. new URL(request.url).origin) so the call
 * targets this same deployment. A failed best-effort kick never surfaces to
 * the user; pg_cron and stale-job kicks are the backstop.
 */
export function kickJobRunner(origin: string): void {
  after(async () => {
    try {
      await fetch(`${origin}/api/internal/jobs/tick`, {
        method: "POST",
        headers: { "x-job-runner-secret": getJobRunnerSecret() },
      });
    } catch {
      logger.warn("job runner kick failed", { errorCode: "KICK_FAILED" });
    }
  });
}

/** Production store backed by processing_jobs and claim_processing_job. */
export function createDbJobStore(
  admin: SupabaseClient = createAdminClient(),
): JobStore {
  return {
    async enqueue(input) {
      const { data, error } = await admin
        .from("processing_jobs")
        .insert({
          document_id: input.documentId,
          user_id: input.userId,
          job_type: input.type,
          idempotency_key: input.idempotencyKey,
          payload: input.payload ?? {},
          status: "queued",
        })
        .select("id")
        .maybeSingle();

      // Unique violation on idempotency_key means the job already exists.
      if (error) {
        if (error.code === "23505") return { jobId: "", created: false };
        throw error;
      }
      return { jobId: data?.id ?? "", created: true };
    },

    async claim(leaseSeconds) {
      const { data, error } = await admin.rpc("claim_processing_job", {
        lease_seconds: leaseSeconds,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row || !row.id) return null;
      return {
        id: row.id,
        documentId: row.document_id,
        userId: row.user_id,
        jobType: row.job_type,
        step: row.step ?? null,
        payload: row.payload ?? {},
        attempts: row.attempts,
        maxAttempts: row.max_attempts,
      };
    },

    async complete(jobId) {
      const { error } = await admin
        .from("processing_jobs")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          lease_expires_at: null,
        })
        .eq("id", jobId);
      if (error) throw error;
    },

    async scheduleRetry(jobId, delayMs, errorCode) {
      const { error } = await admin
        .from("processing_jobs")
        .update({
          status: "RETRY_SCHEDULED",
          run_after: new Date(Date.now() + delayMs).toISOString(),
          lease_expires_at: null,
          ...(errorCode !== undefined ? { error_code: errorCode } : {}),
        })
        .eq("id", jobId);
      if (error) throw error;
    },

    async fail(jobId, errorCode) {
      const { error } = await admin
        .from("processing_jobs")
        .update({
          status: "failed",
          error_code: errorCode,
          lease_expires_at: null,
          completed_at: new Date().toISOString(),
        })
        .eq("id", jobId);
      if (error) throw error;
    },
  };
}

export { TICK_BUDGET_MS };

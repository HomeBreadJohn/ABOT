import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type ClaimedJob,
  type JobType,
  registerJobHandler,
} from "@/features/processing/services/job-registry";
import {
  enqueueJob,
  runDueJobs,
  type JobStore,
  type StoredJob,
} from "@/features/processing/services/job-runner";
import { logger } from "@/lib/logging/logger";

const LEASE_MS = 90_000;

/**
 * In-memory job store with the same claim semantics as claim_processing_job:
 * one job at a time, a job is claimable when it is queued/RETRY_SCHEDULED and
 * due, or processing with an expired lease. Claiming marks it processing,
 * sets a lease, and bumps attempts.
 */
function createMemoryStore() {
  let now = Date.now();
  let seq = 0;
  const rows: StoredJob[] = [];

  const store: JobStore = {
    async enqueue(input) {
      if (rows.some((r) => r.idempotencyKey === input.idempotencyKey)) {
        return { jobId: "", created: false };
      }
      const jobId = `job-${++seq}`;
      rows.push({
        id: jobId,
        documentId: input.documentId,
        userId: input.userId,
        jobType: input.type,
        step: null,
        payload: input.payload ?? {},
        idempotencyKey: input.idempotencyKey,
        status: "queued",
        runAfter: now,
        leaseExpiresAt: null,
        attempts: 0,
        maxAttempts: 5,
        errorCode: null,
      });
      return { jobId, created: true };
    },

    async claim(leaseSeconds) {
      const job = rows.find(
        (r) =>
          ((r.status === "queued" || r.status === "RETRY_SCHEDULED") &&
            r.runAfter <= now) ||
          (r.status === "processing" &&
            r.leaseExpiresAt !== null &&
            r.leaseExpiresAt < now),
      );
      if (!job) return null;
      job.status = "processing";
      job.leaseExpiresAt = now + leaseSeconds * 1000;
      job.attempts += 1;
      return {
        id: job.id,
        documentId: job.documentId,
        userId: job.userId,
        jobType: job.jobType,
        step: job.step,
        payload: job.payload,
        attempts: job.attempts,
        maxAttempts: job.maxAttempts,
      };
    },

    async complete(jobId) {
      const job = rows.find((r) => r.id === jobId);
      if (job) job.status = "completed";
    },

    async scheduleRetry(jobId, delayMs, errorCode) {
      const job = rows.find((r) => r.id === jobId);
      if (!job) return;
      job.status = "RETRY_SCHEDULED";
      job.runAfter = now + delayMs;
      job.leaseExpiresAt = null;
      if (errorCode !== undefined) job.errorCode = errorCode;
    },

    async fail(jobId, errorCode) {
      const job = rows.find((r) => r.id === jobId);
      if (!job) return;
      job.status = "failed";
      job.errorCode = errorCode;
      job.leaseExpiresAt = null;
    },
  };

  return {
    store,
    rows,
    clock: () => now,
    get now() {
      return now;
    },
    advance(ms: number) {
      now += ms;
    },
    seed(partial: Partial<StoredJob> & { jobType: JobType }) {
      const jobId = `job-${++seq}`;
      const row: StoredJob = {
        id: jobId,
        documentId: "doc-1",
        userId: "user-1",
        step: null,
        payload: {},
        idempotencyKey: `key-${jobId}`,
        status: "queued",
        runAfter: now,
        leaseExpiresAt: null,
        attempts: 0,
        maxAttempts: 5,
        errorCode: null,
        ...partial,
      };
      rows.push(row);
      return row;
    },
  };
}

function resetHandlers() {
  for (const type of [
    "OCR_SUBMIT",
    "OCR_POLL",
    "OCR_FETCH",
    "ANALYZE",
    "REANALYZE",
    "TRANSLATE",
    "CROSS_ANALYZE",
  ] as JobType[]) {
    registerJobHandler(type, async () => ({ kind: "done" }));
  }
}

beforeEach(() => {
  resetHandlers();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("enqueueJob", () => {
  it("returns created:false and adds no row for a duplicate idempotencyKey", async () => {
    const mem = createMemoryStore();
    const input = {
      documentId: "doc-1",
      userId: "user-1",
      type: "ANALYZE" as JobType,
      idempotencyKey: "analyze:doc-1",
    };

    const first = await enqueueJob(input, mem.store);
    expect(first.created).toBe(true);

    const second = await enqueueJob(input, mem.store);
    expect(second.created).toBe(false);
    expect(mem.rows).toHaveLength(1);
  });
});

describe("runDueJobs", () => {
  it("runs a due job and marks it completed", async () => {
    const mem = createMemoryStore();
    mem.seed({ jobType: "ANALYZE" });

    const { ran } = await runDueJobs(45_000, mem.store, mem.clock);

    expect(ran).toBe(1);
    expect(mem.rows[0].status).toBe("completed");
  });

  it("schedules RETRY_SCHEDULED with exponential 5s/20s/80s backoff", async () => {
    const mem = createMemoryStore();
    registerJobHandler("ANALYZE", async () => ({
      kind: "retry",
      afterMs: 1_000,
      reason: "provider busy",
    }));
    const row = mem.seed({ jobType: "ANALYZE" });

    await runDueJobs(45_000, mem.store, mem.clock);
    expect(row.status).toBe("RETRY_SCHEDULED");
    // attempts === 1 after first claim -> 5s
    expect(row.runAfter).toBe(mem.now + 5_000);

    mem.advance(5_000);
    await runDueJobs(45_000, mem.store, mem.clock);
    expect(row.runAfter).toBe(mem.now + 20_000); // attempts 2 -> 20s

    mem.advance(20_000);
    await runDueJobs(45_000, mem.store, mem.clock);
    expect(row.runAfter).toBe(mem.now + 80_000); // attempts 3 -> 80s
  });

  it("fails with MAX_ATTEMPTS once attempts exceed max", async () => {
    const mem = createMemoryStore();
    registerJobHandler("ANALYZE", async () => ({
      kind: "retry",
      afterMs: 1_000,
      reason: "still failing",
    }));
    // max_attempts 2: after the second claim, retry turns into a failure.
    const row = mem.seed({ jobType: "ANALYZE", maxAttempts: 2 });

    await runDueJobs(45_000, mem.store, mem.clock); // attempt 1 -> RETRY_SCHEDULED
    expect(row.status).toBe("RETRY_SCHEDULED");

    mem.advance(10_000);
    await runDueJobs(45_000, mem.store, mem.clock); // attempt 2 == max -> failed
    expect(row.status).toBe("failed");
    expect(row.errorCode).toBe("MAX_ATTEMPTS");
  });

  it("reclaims a processing job whose lease expired and bumps attempts", async () => {
    const mem = createMemoryStore();
    const row = mem.seed({
      jobType: "ANALYZE",
      status: "processing",
      leaseExpiresAt: mem.now - 1_000,
      attempts: 1,
    });

    const { ran } = await runDueJobs(45_000, mem.store, mem.clock);

    expect(ran).toBe(1);
    expect(row.attempts).toBe(2);
    expect(row.status).toBe("completed");
  });

  it("stops claiming once the budget is used and leaves the rest queued", async () => {
    const mem = createMemoryStore();
    mem.seed({ jobType: "ANALYZE", idempotencyKey: "a" });
    mem.seed({ jobType: "ANALYZE", idempotencyKey: "b" });

    // Each handler advances the fake clock past the budget.
    registerJobHandler("ANALYZE", async () => {
      mem.advance(50_000);
      return { kind: "done" };
    });

    const { ran } = await runDueJobs(45_000, mem.store, mem.clock);

    expect(ran).toBe(1);
    const statuses = mem.rows.map((r) => r.status).sort();
    expect(statuses).toEqual(["completed", "queued"]);
  });

  it("logs a thrown handler error with only allowlisted keys, then retries", async () => {
    const mem = createMemoryStore();
    const row = mem.seed({ jobType: "ANALYZE" });
    registerJobHandler("ANALYZE", async () => {
      throw new Error("secret payload boom with stack details");
    });

    const errorSpy = vi.spyOn(logger, "error");

    await runDueJobs(45_000, mem.store, mem.clock);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [, fields] = errorSpy.mock.calls[0];
    expect(Object.keys(fields ?? {}).sort()).toEqual([
      "errorCode",
      "jobId",
      "jobType",
    ]);
    const serialized = JSON.stringify(errorSpy.mock.calls[0]);
    expect(serialized).not.toContain("secret payload boom");
    expect(serialized).not.toContain("stack");

    expect(row.status).toBe("RETRY_SCHEDULED");
    expect(row.runAfter).toBe(mem.now + 5_000);
  });

  it("enqueues follow-up jobs on done with next", async () => {
    const mem = createMemoryStore();
    mem.seed({ jobType: "OCR_SUBMIT" });
    registerJobHandler("OCR_SUBMIT", async (job: ClaimedJob) => ({
      kind: "done",
      next: [
        {
          documentId: job.documentId,
          userId: job.userId,
          type: "OCR_POLL" as JobType,
          idempotencyKey: "ocr-poll:doc-1",
        },
      ],
    }));

    await runDueJobs(45_000, mem.store, mem.clock);

    expect(mem.rows.some((r) => r.jobType === "OCR_POLL")).toBe(true);
  });
});

// The lease the runner asks the store for is 90 seconds.
it("claims with a 90-second lease", async () => {
  const mem = createMemoryStore();
  const row = mem.seed({ jobType: "ANALYZE" });
  const claimSpy = vi.spyOn(mem.store, "claim");

  await runDueJobs(45_000, mem.store, mem.clock);

  expect(claimSpy).toHaveBeenCalledWith(LEASE_MS / 1000);
  expect(row.status).toBe("completed");
});

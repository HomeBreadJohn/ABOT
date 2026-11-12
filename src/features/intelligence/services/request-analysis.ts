import "server-only";

import {
  analyzeResponseSchema,
  type DocumentLifecycle,
} from "@/contracts";
import { requireUser } from "@/lib/auth/require-user";
import { AppError } from "@/lib/http/app-error";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  enqueueJob,
  kickJobRunner,
} from "@/features/processing/services/job-runner";
import type { JobType } from "@/features/processing/services/job-registry";
import type { z } from "zod";

/** At most this many analyze calls per user per hour. */
const RATE_LIMIT_PER_HOUR = 10;

type AnalyzeRequest = {
  mode: "START" | "RETRY" | "REANALYZE";
  idempotencyKey: string;
};

/** Data-access seam so unit tests run against in-memory fakes. */
export type RequestAnalysisDeps = {
  /** Lifecycle of the caller's document, or null when not owned/visible. */
  loadLifecycle: (
    userId: string,
    documentId: string,
  ) => Promise<DocumentLifecycle | null>;
  /** Number of analyze-type jobs this user enqueued in the last hour. */
  countRecentAnalyzeJobs: (userId: string) => Promise<number>;
  enqueue: typeof enqueueJob;
  kick: typeof kickJobRunner;
};

/**
 * Start, retry, or rerun analysis. The job type is chosen from the document's
 * lifecycle and the requested mode. Enqueue is idempotent on idempotencyKey,
 * so a repeated request never creates a second job. Each path kicks the runner
 * so the pipeline starts without waiting for pg_cron.
 */
export async function requestAnalysis(
  userId: string,
  documentId: string,
  request: AnalyzeRequest,
  origin: string,
  deps: RequestAnalysisDeps = defaultDeps(),
): Promise<z.infer<typeof analyzeResponseSchema>> {
  const lifecycle = await deps.loadLifecycle(userId, documentId);
  if (!lifecycle) throw new AppError("NOT_FOUND");

  const jobType = chooseJobType(request.mode, lifecycle);

  // Rate limit before enqueuing so a flood of requests cannot queue work.
  const recent = await deps.countRecentAnalyzeJobs(userId);
  if (recent > RATE_LIMIT_PER_HOUR) throw new AppError("RATE_LIMITED");

  const { jobId } = await deps.enqueue({
    documentId,
    userId,
    type: jobType,
    idempotencyKey: request.idempotencyKey,
  });
  deps.kick(origin);

  return analyzeResponseSchema.parse({ documentId, jobId });
}

/**
 * Map mode + lifecycle to a job type. CONFLICT when the request does not make
 * sense for the current state (e.g. START on an already COMPLETED document).
 */
function chooseJobType(
  mode: AnalyzeRequest["mode"],
  lifecycle: DocumentLifecycle,
): JobType {
  if (mode === "REANALYZE") return "REANALYZE";

  // Re-running a finished document must use REANALYZE, never START/RETRY.
  if (lifecycle === "COMPLETED") throw new AppError("CONFLICT");

  if (mode === "RETRY") {
    if (lifecycle === "OCR_FAILED") return "OCR_SUBMIT";
    if (lifecycle === "ANALYSIS_FAILED") return "ANALYZE";
    throw new AppError("CONFLICT");
  }

  // START: the OCR output must be ready.
  if (lifecycle === "OCR_READY" || lifecycle === "OCR_PARTIAL") return "ANALYZE";
  throw new AppError("CONFLICT");
}

function defaultDeps(): RequestAnalysisDeps {
  const admin = createAdminClient();
  return {
    async loadLifecycle(userId, documentId) {
      const { supabase } = await requireUser();
      const { data } = await supabase
        .from("documents")
        .select("processing_status, user_id")
        .eq("id", documentId)
        .maybeSingle();
      // Only the owner may start analysis; a recipient gets NOT_FOUND.
      if (!data || data.user_id !== userId) return null;
      return data.processing_status as DocumentLifecycle;
    },
    async countRecentAnalyzeJobs(userId) {
      const since = new Date(Date.now() - 60 * 60_000).toISOString();
      const { count } = await admin
        .from("processing_jobs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .in("job_type", ["ANALYZE", "REANALYZE", "OCR_SUBMIT"])
        .gte("created_at", since);
      return count ?? 0;
    },
    enqueue: enqueueJob,
    kick: kickJobRunner,
  };
}

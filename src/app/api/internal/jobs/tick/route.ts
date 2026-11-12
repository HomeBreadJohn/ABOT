import { createHash, timingSafeEqual } from "node:crypto";

import { getJobRunnerSecret } from "@/lib/env/server";
import { runDueJobs } from "@/features/processing/services/job-runner";
import { registerPipelineHandlers } from "@/features/intelligence/services/register-pipeline-handlers";

export const maxDuration = 60;

const TICK_BUDGET_MS = 45_000;

/** Constant-time compare: hash both sides to a fixed length first. */
function secretMatches(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function POST(request: Request): Promise<Response> {
  const provided = request.headers.get("x-job-runner-secret") ?? "";
  if (!secretMatches(provided, getJobRunnerSecret())) {
    // Never log the header value.
    return new Response(null, { status: 401 });
  }

  registerPipelineHandlers();
  const { ran } = await runDueJobs(TICK_BUDGET_MS);
  return Response.json({ ran });
}

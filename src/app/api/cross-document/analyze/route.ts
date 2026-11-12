import { crossAnalyzeRequestSchema } from "@/contracts";
import { apiOk, withApiErrors } from "@/lib/http/api-response";
import { requireUser } from "@/lib/auth/require-user";

import { requestCrossAnalysis } from "@/features/relationships/services/cross-analysis";

// Start a combined analysis of 2-5 documents. The work runs as a CROSS_ANALYZE
// job; this returns the new cross-analysis id to poll.
export const POST = withApiErrors(async (request: Request) => {
  const { userId } = await requireUser();
  const { documentIds } = crossAnalyzeRequestSchema.parse(await request.json());
  return apiOk(await requestCrossAnalysis(userId, documentIds));
});

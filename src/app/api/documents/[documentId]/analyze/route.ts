import { analyzeRequestSchema } from "@/contracts";
import { apiOk, withApiErrors } from "@/lib/http/api-response";
import { requireUser } from "@/lib/auth/require-user";

import { requestAnalysis } from "@/features/intelligence/services/request-analysis";

// Start, retry, or rerun analysis. The job type is chosen from the document's
// lifecycle and the requested mode; the runner is kicked after enqueue.
export const POST = withApiErrors(
  async (
    request: Request,
    { params }: { params: Promise<{ documentId: string }> },
  ) => {
    const { userId } = await requireUser();
    const { documentId } = await params;
    const input = analyzeRequestSchema.parse(await request.json());
    const origin = new URL(request.url).origin;
    return apiOk(await requestAnalysis(userId, documentId, input, origin));
  },
);

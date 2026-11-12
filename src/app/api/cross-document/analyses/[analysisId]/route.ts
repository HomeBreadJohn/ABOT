import { apiOk, withApiErrors } from "@/lib/http/api-response";
import { requireUser } from "@/lib/auth/require-user";

import { getCrossAnalysis } from "@/features/relationships/services/cross-analysis";

// A combined cross-document analysis result (RUNNING/SUCCEEDED/FAILED).
// Owner-or-shared only; otherwise NOT_FOUND.
export const GET = withApiErrors(
  async (
    _request: Request,
    { params }: { params: Promise<{ analysisId: string }> },
  ) => {
    const { userId } = await requireUser();
    const { analysisId } = await params;
    return apiOk(await getCrossAnalysis(userId, analysisId));
  },
);

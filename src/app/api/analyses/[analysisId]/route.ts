import { apiOk, withApiErrors } from "@/lib/http/api-response";
import { requireUser } from "@/lib/auth/require-user";

import { getAnalysisById } from "@/features/documents/services/document-queries";

// A specific analysis version. Only a SUCCEEDED version is returned.
export const GET = withApiErrors(
  async (
    _request: Request,
    { params }: { params: Promise<{ analysisId: string }> },
  ) => {
    const { userId } = await requireUser();
    const { analysisId } = await params;
    return apiOk(await getAnalysisById(userId, analysisId));
  },
);

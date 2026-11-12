import { getAnalysisQuerySchema } from "@/contracts";
import { apiOk, withApiErrors } from "@/lib/http/api-response";
import { requireUser } from "@/lib/auth/require-user";

import { getAnalysis } from "@/features/documents/services/document-queries";

// Latest analysis or a not-ready status. A non-SUCCEEDED analysis is never
// returned as READY; a stale queued job kicks the runner.
export const GET = withApiErrors(
  async (
    request: Request,
    { params }: { params: Promise<{ documentId: string }> },
  ) => {
    const { userId } = await requireUser();
    const { documentId } = await params;
    const { language } = getAnalysisQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const origin = new URL(request.url).origin;
    return apiOk(
      await getAnalysis(userId, documentId, language, undefined, origin),
    );
  },
);

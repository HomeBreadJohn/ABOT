import { apiOk, withApiErrors } from "@/lib/http/api-response";
import { requireUser } from "@/lib/auth/require-user";

import { completeUpload } from "@/features/documents/services/complete-upload";

export const POST = withApiErrors(
  async (
    request: Request,
    { params }: { params: Promise<{ documentId: string }> },
  ) => {
    const { userId } = await requireUser();
    const { documentId } = await params;
    const origin = new URL(request.url).origin;
    return apiOk(await completeUpload(userId, documentId, origin));
  },
);

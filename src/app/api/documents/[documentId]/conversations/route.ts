import { openConversationRequestSchema } from "@/contracts";
import { apiOk, withApiErrors } from "@/lib/http/api-response";
import { requireUser } from "@/lib/auth/require-user";

import { openConversation } from "@/features/conversations/services/conversations";

// Open a conversation on a document. The caller must own or be shared the
// document; otherwise NOT_FOUND hides its existence.
export const POST = withApiErrors(
  async (
    request: Request,
    { params }: { params: Promise<{ documentId: string }> },
  ) => {
    const { userId } = await requireUser();
    const { documentId } = await params;
    openConversationRequestSchema.parse(await request.json().catch(() => ({})));
    return apiOk(await openConversation(userId, documentId));
  },
);

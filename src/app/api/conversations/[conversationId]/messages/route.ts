import {
  listMessagesRequestSchema,
  sendMessageRequestSchema,
} from "@/contracts";
import { apiOk, withApiErrors } from "@/lib/http/api-response";
import { requireUser } from "@/lib/auth/require-user";

import {
  askQuestion,
  listConversationMessages,
} from "@/features/conversations/services/conversations";

// A grounded follow-up turn runs synchronously (one OCR-free chat round-trip),
// so it fits within a 60-second function budget.
export const maxDuration = 60;

// Ask a grounded question. The answer is produced only from the document's
// report summary and matching evidence; cited evidence IDs are filtered to ones
// that exist in the current analysis.
export const POST = withApiErrors(
  async (
    request: Request,
    { params }: { params: Promise<{ conversationId: string }> },
  ) => {
    const { userId } = await requireUser();
    const { conversationId } = await params;
    const { content } = sendMessageRequestSchema.parse(await request.json());
    return apiOk(await askQuestion(userId, conversationId, content));
  },
);

// Message history for a conversation the caller owns.
export const GET = withApiErrors(
  async (
    _request: Request,
    { params }: { params: Promise<{ conversationId: string }> },
  ) => {
    const { userId } = await requireUser();
    const { conversationId } = await params;
    listMessagesRequestSchema.parse({});
    return apiOk(await listConversationMessages(userId, conversationId));
  },
);

/** Conversation (ask-the-document) endpoints. Types derive from the contracts. */
import type { z } from "zod";

import {
  listMessagesResponseSchema,
  openConversationResponseSchema,
  sendMessageRequestSchema,
  sendMessageResponseSchema,
} from "@/contracts";
import { apiFetch } from "@/lib/api-client/client";

type OpenConversationResponse = z.infer<typeof openConversationResponseSchema>;
type SendMessageRequest = z.infer<typeof sendMessageRequestSchema>;
type SendMessageResponse = z.infer<typeof sendMessageResponseSchema>;
type ListMessagesResponse = z.infer<typeof listMessagesResponseSchema>;

/** POST /api/documents/:id/conversations — open a conversation on a document. */
export function openConversation(
  documentId: string,
): Promise<OpenConversationResponse> {
  return apiFetch(`/api/documents/${documentId}/conversations`, {
    method: "POST",
    schema: openConversationResponseSchema,
  });
}

/** POST /api/conversations/:id/messages — ask a grounded question. */
export function askQuestion(
  conversationId: string,
  input: SendMessageRequest,
): Promise<SendMessageResponse> {
  return apiFetch(`/api/conversations/${conversationId}/messages`, {
    method: "POST",
    body: input,
    schema: sendMessageResponseSchema,
  });
}

/** GET /api/conversations/:id/messages — the message history. */
export function listMessages(
  conversationId: string,
): Promise<ListMessagesResponse> {
  return apiFetch(`/api/conversations/${conversationId}/messages`, {
    schema: listMessagesResponseSchema,
  });
}

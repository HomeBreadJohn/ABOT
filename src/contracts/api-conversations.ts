/**
 * Conversation endpoint contracts. Messages are capped at 1,000 characters
 * (the 4,000-character provider budget includes instructions and context).
 */
import { z } from "zod";

/* POST /api/documents/:id/conversations */
export const openConversationRequestSchema = z.strictObject({});
export const openConversationResponseSchema = z.object({
  conversationId: z.string().min(1),
  documentId: z.string().min(1),
});

/* POST /api/conversations/:id/messages */
export const sendMessageRequestSchema = z.strictObject({
  content: z.string().trim().min(1).max(1000),
});

export const sendMessageResponseSchema = z.object({
  messageId: z.string().min(1),
  answer: z.string(),
  evidenceIds: z.array(z.string()),
  notFoundInDocument: z.boolean(),
});

/* GET /api/conversations/:id/messages */
export const listMessagesRequestSchema = z.strictObject({});
export const conversationMessageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(["USER", "ASSISTANT"]),
  content: z.string(),
  evidenceIds: z.array(z.string()).optional(),
  createdAt: z.string(),
});
export const listMessagesResponseSchema = z.object({
  messages: z.array(conversationMessageSchema),
});

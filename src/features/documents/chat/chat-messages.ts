import type { z } from "zod";

import type {
  conversationMessageSchema,
  sendMessageResponseSchema,
} from "@/contracts";

export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  evidenceIds: string[];
  /**
   * True only for a live answer the assistant flagged as not in the document.
   * Stored history does not carry this flag.
   */
  notFoundInDocument: boolean;
};

type HistoryMessage = z.infer<typeof conversationMessageSchema>;
type SendResponse = z.infer<typeof sendMessageResponseSchema>;

export function fromHistory(message: HistoryMessage): ChatMessage {
  return {
    id: message.id,
    role: message.role === "USER" ? "user" : "assistant",
    content: message.content,
    evidenceIds: message.evidenceIds ?? [],
    notFoundInDocument: false,
  };
}

export function optimisticUserMessage(
  id: string,
  content: string,
): ChatMessage {
  return {
    id,
    role: "user",
    content,
    evidenceIds: [],
    notFoundInDocument: false,
  };
}

export function fromAnswer(response: SendResponse): ChatMessage {
  return {
    id: response.messageId,
    role: "assistant",
    content: response.answer,
    evidenceIds: response.notFoundInDocument ? [] : response.evidenceIds,
    notFoundInDocument: response.notFoundInDocument,
  };
}

/** Fixed copy shown instead of an answer the assistant could not ground. */
export const NOT_IN_DOCUMENT_COPY = "This isn't in your document";

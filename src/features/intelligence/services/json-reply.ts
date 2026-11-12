import { z, type ZodType } from "zod";

import { AppError } from "@/lib/http/app-error";
import {
  CHAT_MESSAGE_MAX_LENGTH,
  type ChatProvider,
} from "@/lib/providers/chat-provider";

/** Strip code fences and extract the first balanced JSON object, or null. */
function extractJson(reply: string): unknown {
  const fenced = reply.replace(/```(?:json)?/gi, "");
  const start = fenced.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < fenced.length; i++) {
    if (fenced[i] === "{") depth++;
    else if (fenced[i] === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(fenced.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function guardLength(message: string): void {
  if (message.length > CHAT_MESSAGE_MAX_LENGTH) {
    throw new Error(
      `Chat message exceeds ${CHAT_MESSAGE_MAX_LENGTH} characters.`,
    );
  }
}

/**
 * Sends one message, parses the reply as JSON, and validates it against
 * `schema`. On a parse or schema failure it sends exactly one repair message
 * (the validation errors plus "return only JSON"). A second failure throws an
 * AppError mapping to INVALID_ANALYSIS. At most two messages are ever sent.
 */
export async function requestJson<T>(
  chat: ChatProvider,
  sessionId: string,
  message: string,
  schema: ZodType<T>,
): Promise<T> {
  guardLength(message);
  const first = await chat.send(sessionId, message);
  const firstResult = schema.safeParse(extractJson(first.reply));
  if (firstResult.success) return firstResult.data;

  const repair = `Your previous reply could not be parsed as the required JSON. Errors: ${z.prettifyError(
    firstResult.error,
  )}. Please return only JSON, with no prose or code fences.`;
  guardLength(repair);
  const second = await chat.send(sessionId, repair);
  const secondResult = schema.safeParse(extractJson(second.reply));
  if (secondResult.success) return secondResult.data;

  throw new AppError(
    "INVALID_ANALYSIS",
    "The assistant did not return valid JSON after one repair attempt.",
  );
}

import type { ApiErrorCode } from "@/contracts";
import { ApiClientError } from "@/lib/api-client/client";

/**
 * Fixed, user-facing copy for every API error code. These strings never
 * include the server's message, so raw error text cannot reach the screen.
 */
export const SAFE_API_MESSAGES: Record<ApiErrorCode, string> = {
  UNAUTHENTICATED: "Your session has ended. Please sign in again.",
  FORBIDDEN: "You don't have access to this.",
  NOT_FOUND: "We couldn't find that. It may have been removed.",
  INVALID_REQUEST:
    "Something about that request wasn't right. Please check it and try again.",
  CONFLICT:
    "That can't be done right now because of the document's current state.",
  NOT_READY: "This isn't ready yet. Please try again in a moment.",
  UNSUPPORTED_FILE:
    "This file type isn't supported. Please upload a PDF or a photo of the document.",
  RATE_LIMITED:
    "You're doing that too often. Please wait a moment and try again.",
  PROVIDER_UNAVAILABLE:
    "The reading service is unavailable right now. Please try again shortly.",
  INVALID_ANALYSIS:
    "We couldn't produce a reliable result for this document. Please try again.",
  INTERNAL_ERROR: "Something went wrong on our side. Please try again.",
};

/** Maps any thrown value to fixed safe copy. Unknown values use INTERNAL_ERROR. */
export function safeMessageFor(error: unknown): string {
  return SAFE_API_MESSAGES[safeCodeFor(error)];
}

/** The API error code for a thrown value, or INTERNAL_ERROR when unknown. */
export function safeCodeFor(error: unknown): ApiErrorCode {
  if (
    error instanceof ApiClientError &&
    Object.hasOwn(SAFE_API_MESSAGES, error.code)
  ) {
    return error.code;
  }
  return "INTERNAL_ERROR";
}

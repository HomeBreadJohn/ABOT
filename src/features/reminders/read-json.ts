import { AppError } from "@/lib/http/app-error";

/**
 * Parse a request's JSON body. Malformed JSON is a client error
 * (INVALID_REQUEST), not an unhandled 500. With `optional`, an empty body
 * yields undefined (DELETE carries none).
 */
export async function readJson(
  request: Request,
  options: { optional?: boolean } = {},
): Promise<unknown> {
  const text = await request.text();
  if (text.trim() === "") {
    if (options.optional) return undefined;
    throw new AppError("INVALID_REQUEST", "Request body is required.");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError("INVALID_REQUEST", "Request body must be valid JSON.");
  }
}

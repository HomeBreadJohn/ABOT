/**
 * Browser-side fetch wrapper for the app's own /api routes. Same-origin cookies
 * carry the Supabase session, so every call uses relative URLs and
 * `credentials: "same-origin"`. A non-2xx response is mapped to ApiClientError
 * carrying the shared contract error shape ({ code, message }); routes return
 * that shape via apiFail (src/lib/http/api-response.ts).
 */
import type { z } from "zod";

import { apiErrorSchema, type ApiErrorCode } from "@/contracts";

/** A failed API call. `code` is the contract error code; `status` is the HTTP status. */
export class ApiClientError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

type ApiFetchOptions<T> = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  /** Serialized to JSON with a content-type header when present. */
  body?: unknown;
  /** Contract response schema; when given, the parsed body is validated. */
  schema?: z.ZodType<T>;
};

/** Call a route, return its JSON body, and throw ApiClientError on a non-2xx. */
export async function apiFetch<T = unknown>(
  path: string,
  options: ApiFetchOptions<T> = {},
): Promise<T> {
  const { method = "GET", body, schema } = options;

  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    ...(body === undefined
      ? {}
      : {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
  });

  if (!response.ok) throw await toApiClientError(response);

  const data = (await response.json()) as T;
  return schema ? schema.parse(data) : data;
}

/** PUT raw file bytes straight to a Supabase Storage signed URL (not our API). */
export async function uploadToSignedUrl(
  uploadUrl: string,
  file: File,
): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "content-type": file.type },
    body: file,
  });
  if (!response.ok)
    throw new ApiClientError(
      "PROVIDER_UNAVAILABLE",
      "File upload to storage failed.",
      response.status,
    );
}

/** Read a non-2xx body as the contract error shape, falling back to INTERNAL_ERROR. */
async function toApiClientError(response: Response): Promise<ApiClientError> {
  const parsed = apiErrorSchema.safeParse(await response.json().catch(() => null));
  if (parsed.success)
    return new ApiClientError(
      parsed.data.error.code,
      parsed.data.error.message,
      response.status,
    );
  return new ApiClientError(
    "INTERNAL_ERROR",
    "An unexpected error occurred.",
    response.status,
  );
}

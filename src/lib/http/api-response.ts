import { randomUUID } from "node:crypto";

import { z } from "zod";

import {
  API_ERROR_HTTP_STATUS,
  apiErrorSchema,
  type ApiErrorCode,
  type ApiIssue,
} from "@/contracts";
import { AppError } from "@/lib/http/app-error";
import { logger } from "@/lib/logging/logger";

/** 200 response with the route's contract body. */
export function apiOk<T>(data: T, init?: ResponseInit): Response {
  return Response.json(data, init);
}

/** Error response in the shared contract shape, with the code's HTTP status. */
export function apiFail(
  code: ApiErrorCode,
  message: string,
  issues?: ApiIssue[],
  requestId = randomUUID(),
): Response {
  const body = apiErrorSchema.parse({
    error: {
      code,
      message,
      requestId,
      ...(issues ? { issues } : {}),
    },
  });
  return Response.json(body, { status: API_ERROR_HTTP_STATUS[code] });
}

/** Maps thrown errors to contract error responses; never leaks the original text. */
export function withApiErrors<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response> | Response,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof AppError) {
        return apiFail(error.code, error.message, error.issues);
      }
      if (error instanceof z.ZodError) {
        // Path and message only; issue details can carry raw input values.
        const issues: ApiIssue[] = error.issues.map((issue) => ({
          path: issue.path.filter(
            (segment): segment is string | number =>
              typeof segment === "string" || typeof segment === "number",
          ),
          message: issue.message,
        }));
        return apiFail("INVALID_REQUEST", "Request validation failed.", issues);
      }
      // Generated before the response so the logged id matches the client's.
      const requestId = randomUUID();
      logger.error("unhandled route error", {
        errorCode: "INTERNAL_ERROR",
        requestId,
      });
      return apiFail(
        "INTERNAL_ERROR",
        "An unexpected error occurred.",
        undefined,
        requestId,
      );
    }
  };
}

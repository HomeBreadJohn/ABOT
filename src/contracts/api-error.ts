/**
 * Shared application API error contract, from product.md section 14.
 * Every error response uses the same shape; codes map to fixed HTTP statuses.
 * Own module so area files can import it without a barrel cycle.
 */
import { z } from "zod";

export const apiErrorCodeSchema = z.enum([
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "INVALID_REQUEST",
  "CONFLICT",
  "NOT_READY",
  "UNSUPPORTED_FILE",
  "RATE_LIMITED",
  "PROVIDER_UNAVAILABLE",
  "INVALID_ANALYSIS",
  "INTERNAL_ERROR",
]);
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

export const apiIssueSchema = z.object({
  path: z.array(z.union([z.string(), z.number()])),
  message: z.string(),
});
export type ApiIssue = z.infer<typeof apiIssueSchema>;

export const apiErrorSchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema,
    message: z.string(),
    issues: z.array(apiIssueSchema).optional(),
    requestId: z.uuid(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const API_ERROR_HTTP_STATUS: Record<ApiErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID_REQUEST: 400,
  CONFLICT: 409,
  NOT_READY: 409,
  UNSUPPORTED_FILE: 415,
  RATE_LIMITED: 429,
  PROVIDER_UNAVAILABLE: 503,
  INVALID_ANALYSIS: 502,
  INTERNAL_ERROR: 500,
};

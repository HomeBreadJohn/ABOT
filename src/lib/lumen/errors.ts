/**
 * Errors from the Lumen gateway, mapped to a small stable set of codes. The raw
 * response body never reaches the message, so document text and secrets cannot
 * leak into logs or error reports.
 */
export type LumenErrorCode =
  | "UNAUTHORIZED"
  | "GRANT_MISSING"
  | "CREDITS_INSUFFICIENT"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "UNAVAILABLE"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INVALID_RESPONSE";

export class LumenError extends Error {
  readonly code: LumenErrorCode;
  /** HTTP status when the error came from a response; 0 for timeouts/schema. */
  readonly status: number;

  constructor(code: LumenErrorCode, status = 0) {
    super(`Lumen request failed: ${code}`);
    this.name = "LumenError";
    this.code = code;
    this.status = status;
  }
}

/**
 * Maps an HTTP status and the gateway's error `code` to a LumenError code.
 * The gateway body is `{ error: { code, message } }`; only the short code is
 * consulted, never the message.
 */
export function lumenErrorFromResponse(
  status: number,
  gatewayCode: string | undefined,
): LumenError {
  switch (status) {
    case 401:
      return new LumenError("UNAUTHORIZED", status);
    case 403:
      if (
        gatewayCode === "API_CREDITS_INSUFFICIENT" ||
        gatewayCode === "LC_INSUFFICIENT"
      ) {
        return new LumenError("CREDITS_INSUFFICIENT", status);
      }
      if (
        gatewayCode === "ACCESS_DENIED" ||
        gatewayCode === "VIEW_ONLY_ACCESS"
      ) {
        return new LumenError("UNAUTHORIZED", status);
      }
      // A key present but lacking the OCR grant.
      return new LumenError("GRANT_MISSING", status);
    case 404:
      return new LumenError("NOT_FOUND", status);
    case 409:
      return new LumenError("CONFLICT", status);
    case 429:
      return new LumenError("RATE_LIMITED", status);
    case 502:
    case 503:
      return new LumenError("UNAVAILABLE", status);
    default:
      if (status >= 500) return new LumenError("UNAVAILABLE", status);
      // 400/413/415/428 and other 4xx: treat as an invalid exchange without
      // echoing the body.
      return new LumenError("INVALID_RESPONSE", status);
  }
}

import type { ApiErrorCode, ApiIssue } from "@/contracts";

/** Error carrying a shared API error code (src/contracts/api-error.ts). */
export class AppError extends Error {
  readonly code: ApiErrorCode;
  readonly issues?: ApiIssue[];

  constructor(code: ApiErrorCode, message?: string, issues?: ApiIssue[]) {
    super(message ?? code);
    this.name = "AppError";
    this.code = code;
    this.issues = issues;
  }
}

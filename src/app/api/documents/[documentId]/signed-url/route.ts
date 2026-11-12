import { apiOk, withApiErrors } from "@/lib/http/api-response";
import { AppError } from "@/lib/http/app-error";
import type { ApiErrorCode } from "@/contracts";

import { createDocumentSignedUrl } from "@/features/documents/services/create-signed-url";

// The service throws plain Errors with these message codes.
const SERVICE_ERROR_CODES: Record<string, ApiErrorCode> = {
  AUTHENTICATION_REQUIRED: "UNAUTHENTICATED",
  DOCUMENT_NOT_FOUND: "NOT_FOUND",
  DOCUMENT_NOT_SHARED: "NOT_FOUND",
  SIGNED_URL_FAILED: "PROVIDER_UNAVAILABLE",
};

export const GET = withApiErrors(
  async (
    _request: Request,
    { params }: { params: Promise<{ documentId: string }> },
  ) => {
    const { documentId } = await params;
    try {
      return apiOk(await createDocumentSignedUrl(documentId));
    } catch (error) {
      if (error instanceof Error) {
        const code = SERVICE_ERROR_CODES[error.message];
        if (code) throw new AppError(code, error.message);
      }
      throw error;
    }
  },
);

"use server";

import "server-only";

import { z } from "zod";

import {
  apiErrorCodeSchema,
  documentListItemSchema,
  type ApiErrorCode,
} from "@/contracts";
import {
  discardUploadInputSchema,
  finalizeUploadInputSchema,
  prepareUploadInputSchema,
} from "@/features/documents/schemas/upload";
import {
  DOCUMENTS_ERROR_MESSAGES,
  DocumentsServiceError,
  getDocumentsService,
  type PreparedUpload,
} from "@/features/documents/services";

type DocumentSummary = z.infer<typeof documentListItemSchema>;

export type ActionResult<T> =
  | { readonly ok: true; readonly data: T }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: ApiErrorCode;
        readonly message: string;
        readonly retryable: boolean;
      };
    };

type ActionError = Extract<ActionResult<never>, { readonly ok: false }>["error"];

const INVALID_REQUEST_ERROR: ActionError = {
  code: "INVALID_REQUEST",
  message: DOCUMENTS_ERROR_MESSAGES.INVALID_REQUEST,
  retryable: false,
};

const INTERNAL_ERROR: ActionError = {
  code: "INTERNAL_ERROR",
  message: DOCUMENTS_ERROR_MESSAGES.INTERNAL_ERROR,
  retryable: true,
};

function failure<T>(error: ActionError): ActionResult<T> {
  return { ok: false, error };
}

function mapServiceError(error: unknown): ActionError {
  if (!(error instanceof DocumentsServiceError)) {
    return INTERNAL_ERROR;
  }

  const codeResult = apiErrorCodeSchema.safeParse(error.code);
  if (!codeResult.success) {
    return INTERNAL_ERROR;
  }

  return {
    code: codeResult.data,
    message: DOCUMENTS_ERROR_MESSAGES[codeResult.data],
    retryable: error.retryable,
  };
}

export async function prepareDocumentUploadAction(
  input: unknown,
): Promise<ActionResult<PreparedUpload>> {
  const parsed = prepareUploadInputSchema.safeParse(input);
  if (!parsed.success) {
    return failure(INVALID_REQUEST_ERROR);
  }

  try {
    const prepared = await getDocumentsService().prepareUpload(parsed.data);
    return { ok: true, data: prepared };
  } catch (error: unknown) {
    return failure(mapServiceError(error));
  }
}

export async function finalizeDocumentUploadAction(
  input: unknown,
): Promise<ActionResult<{ readonly document: DocumentSummary }>> {
  const parsed = finalizeUploadInputSchema.safeParse(input);
  if (!parsed.success) {
    return failure(INVALID_REQUEST_ERROR);
  }

  try {
    const document = await getDocumentsService().finalizeUpload(parsed.data);
    return { ok: true, data: { document } };
  } catch (error: unknown) {
    return failure(mapServiceError(error));
  }
}

export async function discardDocumentUploadAction(
  input: unknown,
): Promise<ActionResult<null>> {
  const parsed = discardUploadInputSchema.safeParse(input);
  if (!parsed.success) {
    return failure(INVALID_REQUEST_ERROR);
  }

  try {
    await getDocumentsService().discardUpload(parsed.data);
    return { ok: true, data: null };
  } catch (error: unknown) {
    return failure(mapServiceError(error));
  }
}

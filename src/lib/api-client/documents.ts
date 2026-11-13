/** Document vault endpoints. Types derive from the contract schemas. */
import type { z } from "zod";

import {
  createDocumentResponseSchema,
  deleteDocumentResponseSchema,
  documentDetailResponseSchema,
  documentListResponseSchema,
  updateDocumentRequestSchema,
  uploadCompleteResponseSchema,
  type CreateDocumentRequest,
} from "@/contracts";
import { apiFetch } from "@/lib/api-client/client";

type CreateDocumentResponse = z.infer<typeof createDocumentResponseSchema>;
type UploadCompleteResponse = z.infer<typeof uploadCompleteResponseSchema>;
type DocumentListResponse = z.infer<typeof documentListResponseSchema>;
type DocumentDetailResponse = z.infer<typeof documentDetailResponseSchema>;
type UpdateDocumentRequest = z.infer<typeof updateDocumentRequestSchema>;
type DeleteDocumentResponse = z.infer<typeof deleteDocumentResponseSchema>;

/** POST /api/documents — register a document and get a signed upload URL. */
export function registerDocument(
  input: CreateDocumentRequest,
): Promise<CreateDocumentResponse> {
  return apiFetch("/api/documents", {
    method: "POST",
    body: input,
    schema: createDocumentResponseSchema,
  });
}

/** POST /api/documents/:id/upload-complete — verify the upload and start OCR. */
export function completeUpload(
  documentId: string,
): Promise<UploadCompleteResponse> {
  return apiFetch(`/api/documents/${documentId}/upload-complete`, {
    method: "POST",
    schema: uploadCompleteResponseSchema,
  });
}

/** GET /api/documents — the vault list. */
export function listDocuments(): Promise<DocumentListResponse> {
  return apiFetch("/api/documents", { schema: documentListResponseSchema });
}

/** GET /api/documents/:id — document detail and processing status. */
export function getDocument(
  documentId: string,
): Promise<DocumentDetailResponse> {
  return apiFetch(`/api/documents/${documentId}`, {
    schema: documentDetailResponseSchema,
  });
}

/** PATCH /api/documents/:id — update the title or confirm the category. */
export function updateDocument(
  documentId: string,
  input: UpdateDocumentRequest,
): Promise<DocumentDetailResponse> {
  return apiFetch(`/api/documents/${documentId}`, {
    method: "PATCH",
    body: input,
    schema: documentDetailResponseSchema,
  });
}

/** DELETE /api/documents/:id — delete the document and all derived data. */
export function deleteDocument(
  documentId: string,
): Promise<DeleteDocumentResponse> {
  return apiFetch(`/api/documents/${documentId}`, {
    method: "DELETE",
    schema: deleteDocumentResponseSchema,
  });
}

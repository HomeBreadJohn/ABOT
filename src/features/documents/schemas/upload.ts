import { z } from "zod";

import {
  allowedMimeTypeSchema,
  MAX_DOCUMENT_SIZE_BYTES,
} from "@/contracts/common";

export { allowedMimeTypeSchema, MAX_DOCUMENT_SIZE_BYTES } from "@/contracts/common";

/** Metadata sent to the server before bytes are uploaded. */
export const prepareUploadInputSchema = z.object({
  originalFilename: z.string().trim().min(1).max(1024),
  // The active schema profile applies the narrower policy after this shared
  // contract has validated the MIME type.
  mimeType: allowedMimeTypeSchema,
  fileSize: z.number().int().positive().max(MAX_DOCUMENT_SIZE_BYTES),
});
export type PrepareUploadInput = z.infer<typeof prepareUploadInputSchema>;

/** Metadata sent to the server after a prepared upload has transferred. */
export const finalizeUploadInputSchema = prepareUploadInputSchema.extend({
  documentId: z.uuid(),
});
export type FinalizeUploadInput = z.infer<typeof finalizeUploadInputSchema>;

/** Identifies an uploaded object that should be discarded. */
export const discardUploadInputSchema = z.object({
  documentId: z.uuid(),
  originalFilename: z.string().trim().min(1).max(1024),
  mimeType: allowedMimeTypeSchema,
});
export type DiscardUploadInput = z.infer<typeof discardUploadInputSchema>;

/**
 * Compatibility exports for callers of the original upload schema module.
 * The active profile's MIME allow-list is intentionally checked by the
 * documents service after parsing these transport schemas.
 */
export {
  PRODUCT_MIME_TYPES as ALLOWED_DOCUMENT_MIME_TYPES,
} from "../upload/upload-policy";
export const uploadMetadataSchema = prepareUploadInputSchema;

export function validateDocumentUpload(file: {
  name: string;
  type: string;
  size: number;
}) {
  return prepareUploadInputSchema.parse({
    originalFilename: file.name,
    mimeType: file.type,
    fileSize: file.size,
  });
}

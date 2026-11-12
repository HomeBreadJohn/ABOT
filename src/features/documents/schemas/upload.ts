import { z } from "zod";

export const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "text/plain",
] as const;

export const uploadMetadataSchema = z.object({
  originalFilename: z.string().trim().min(1).max(255),
  mimeType: z.enum(ALLOWED_DOCUMENT_MIME_TYPES),
  fileSize: z.number().int().positive().max(MAX_DOCUMENT_SIZE_BYTES),
});

export function validateDocumentUpload(file: {
  name: string;
  type: string;
  size: number;
}) {
  return uploadMetadataSchema.parse({
    originalFilename: file.name,
    mimeType: file.type,
    fileSize: file.size,
  });
}

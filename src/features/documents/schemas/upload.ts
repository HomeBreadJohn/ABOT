import { z } from "zod";
import { allowedMimeTypeSchema, MAX_DOCUMENT_SIZE_BYTES } from "@/contracts";

export { allowedMimeTypeSchema, MAX_DOCUMENT_SIZE_BYTES };

export const uploadMetadataSchema = z.object({
  originalFilename: z.string().trim().min(1).max(255),
  mimeType: allowedMimeTypeSchema,
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

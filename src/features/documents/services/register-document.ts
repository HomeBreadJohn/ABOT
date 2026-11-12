import "server-only";

import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createDocumentRequestSchema,
  type CreateDocumentRequest,
} from "@/contracts";
import { AppError } from "@/lib/http/app-error";
import { createAdminClient } from "@/lib/supabase/admin";

const STORAGE_BUCKET = "documents";
const MAX_FILENAME_LENGTH = 120;

type Deps = { admin?: SupabaseClient };

/**
 * Register a document before its bytes arrive. Creates the row as
 * AWAITING_UPLOAD and returns a signed upload URL so the browser uploads
 * straight to Storage (the API never receives file bytes, avoiding the 4.5 MB
 * Vercel request-body limit). The file is verified later in completeUpload.
 */
export async function registerDocument(
  userId: string,
  input: CreateDocumentRequest,
  deps: Deps = {},
) {
  const { originalFilename, mimeType, fileSize } =
    createDocumentRequestSchema.parse(input);

  const admin = deps.admin ?? createAdminClient();

  const documentId = randomUUID();
  const safeFilename = buildSafeFilename(originalFilename);
  const storagePath = `${userId}/${documentId}/${safeFilename}`;

  // INSERT policy requires AWAITING_UPLOAD with null OCR/classification fields.
  const { error: insertError } = await admin
    .from("documents")
    .insert({
      id: documentId,
      user_id: userId,
      original_filename: originalFilename,
      mime_type: mimeType,
      file_size: fileSize,
      storage_path: storagePath,
      processing_status: "AWAITING_UPLOAD",
      ocr_document_id: null,
      classification_confidence: null,
    })
    .select("id")
    .single();

  if (insertError) throw new AppError("INTERNAL_ERROR");

  const { data, error } = await admin.storage
    .from(STORAGE_BUCKET)
    .createSignedUploadUrl(storagePath);

  if (error || !data) throw new AppError("PROVIDER_UNAVAILABLE");

  return {
    documentId,
    storagePath,
    uploadToken: data.token,
    uploadUrl: data.signedUrl,
  };
}

/**
 * Reduce a client-supplied name to a single safe path segment: no separators,
 * no traversal, no control characters, capped length. The extension is kept
 * when present.
 */
function buildSafeFilename(name: string): string {
  // Keep only the final segment, then strip anything risky.
  const base = name.split(/[\\/]/).pop() ?? "";
  let safe = base
    .replace(/[\u0000-\u001f]/g, "")
    .replace(/\.\.+/g, ".")
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .replace(/^\.+/, "")
    .slice(0, MAX_FILENAME_LENGTH);

  if (safe.length === 0) safe = "file";
  return safe;
}

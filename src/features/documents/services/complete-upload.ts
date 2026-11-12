import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { DocumentLifecycle } from "@/contracts";
import { requireUser } from "@/lib/auth/require-user";
import { AppError } from "@/lib/http/app-error";
import { createAdminClient } from "@/lib/supabase/admin";
import { detectMimeType } from "@/features/documents/services/file-signature";
import { transitionDocument } from "@/features/processing/services/lifecycle";
import {
  enqueueJob,
  kickJobRunner,
} from "@/features/processing/services/job-runner";

const STORAGE_BUCKET = "documents";
const HEADER_BYTES = 16;

type ServerClient = Awaited<ReturnType<typeof requireUser>>["supabase"];

type Deps = {
  user?: ServerClient;
  admin?: SupabaseClient;
  readHeader?: (
    admin: SupabaseClient,
    storagePath: string,
  ) => Promise<{ size: number; firstBytes: Uint8Array }>;
  enqueue?: typeof enqueueJob;
  kick?: typeof kickJobRunner;
};

/**
 * Verify an uploaded object against what was registered, then start OCR.
 * The document is loaded through the user client so RLS hides other users'
 * rows: a missing row is reported as NOT_FOUND, never FORBIDDEN, so existence
 * is not revealed. The file is validated by its magic bytes and size, not the
 * client-supplied MIME type. Idempotent: once past AWAITING_UPLOAD it returns
 * the current state without re-enqueuing.
 */
export async function completeUpload(
  userId: string,
  documentId: string,
  origin: string,
  deps: Deps = {},
): Promise<{ documentId: string; lifecycle: DocumentLifecycle }> {
  const user = deps.user ?? (await requireUser()).supabase;
  const admin = deps.admin ?? createAdminClient();
  const readHeader = deps.readHeader ?? readStorageHeader;
  const enqueue = deps.enqueue ?? enqueueJob;
  const kick = deps.kick ?? kickJobRunner;

  const { data: document, error } = await user
    .from("documents")
    .select("id, user_id, storage_path, processing_status, mime_type, file_size")
    .eq("id", documentId)
    .maybeSingle();

  // RLS also hides another user's row, so this covers the not-mine case.
  if (error || !document || document.user_id !== userId)
    throw new AppError("NOT_FOUND");

  const lifecycle = document.processing_status as DocumentLifecycle;

  // Already verified (or further along): return current state, enqueue nothing.
  if (lifecycle !== "AWAITING_UPLOAD") return { documentId, lifecycle };

  const { size, firstBytes } = await readHeader(admin, document.storage_path);

  if (size !== document.file_size) throw new AppError("INVALID_REQUEST");

  const detected = detectMimeType(firstBytes);
  if (detected !== document.mime_type) {
    // The bytes do not match the claimed type: remove the object and the row.
    await admin.storage.from(STORAGE_BUCKET).remove([document.storage_path]);
    await admin.from("documents").delete().eq("id", documentId);
    throw new AppError("UNSUPPORTED_FILE");
  }

  await transitionDocument(admin, documentId, "AWAITING_UPLOAD", "UPLOADED");

  await enqueue({
    documentId,
    userId,
    type: "OCR_SUBMIT",
    idempotencyKey: `ocr-submit:${documentId}`,
  });
  kick(origin);

  return { documentId, lifecycle: "UPLOADED" };
}

/**
 * Read only the first bytes and total size of the stored object. Uses a signed
 * URL with an HTTP Range request so the full file never crosses the function.
 */
async function readStorageHeader(
  admin: SupabaseClient,
  storagePath: string,
): Promise<{ size: number; firstBytes: Uint8Array }> {
  const { data, error } = await admin.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(storagePath, 60);
  if (error || !data?.signedUrl) throw new AppError("PROVIDER_UNAVAILABLE");

  const response = await fetch(data.signedUrl, {
    headers: { Range: `bytes=0-${HEADER_BYTES - 1}` },
  });
  if (!response.ok && response.status !== 206)
    throw new AppError("PROVIDER_UNAVAILABLE");

  // Content-Range: "bytes 0-15/<total>" gives the true object size.
  const contentRange = response.headers.get("content-range");
  const total = contentRange?.split("/")[1];
  const size = total ? Number(total) : Number(response.headers.get("content-length"));

  const firstBytes = new Uint8Array(await response.arrayBuffer());
  return { size, firstBytes };
}

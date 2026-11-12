import { z } from "zod";

import { requireUser } from "@/lib/auth/require-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppError } from "@/lib/http/app-error";

const documentIdSchema = z.string().uuid();
const SIGNED_URL_TTL_SECONDS = 60;

export async function createDocumentSignedUrl(documentId: string) {
  const id = documentIdSchema.parse(documentId);
  const { userId, supabase } = await requireUser();

  const { data: document, error: documentError } = await supabase
    .from("documents")
    .select("id, user_id, storage_path")
    .eq("id", id)
    .maybeSingle();

  if (documentError || !document) throw new AppError("NOT_FOUND");

  if (document.user_id !== userId) {
    const { data: share } = await supabase
      .from("document_shares")
      .select("permission")
      .eq("document_id", id)
      .eq("shared_with_user_id", userId)
      .maybeSingle();

    if (!share) throw new AppError("NOT_FOUND");
  }

  const { data: signedUrlData, error } = await createAdminClient()
    .storage.from("documents")
    .createSignedUrl(document.storage_path, SIGNED_URL_TTL_SECONDS);

  if (error || !signedUrlData?.signedUrl)
    throw new AppError("PROVIDER_UNAVAILABLE");
  return {
    signedUrl: signedUrlData.signedUrl,
    expiresIn: SIGNED_URL_TTL_SECONDS,
  };
}

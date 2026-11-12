import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const documentIdSchema = z.string().uuid();
const SIGNED_URL_TTL_SECONDS = 60;

export async function createDocumentSignedUrl(documentId: string) {
  const id = documentIdSchema.parse(documentId);
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;

  if (!userId) throw new Error("AUTHENTICATION_REQUIRED");

  const { data: document, error: documentError } = await supabase
    .from("documents")
    .select("id, user_id, storage_path")
    .eq("id", id)
    .maybeSingle();

  if (documentError || !document) throw new Error("DOCUMENT_NOT_FOUND");

  if (document.user_id !== userId) {
    const { data: share } = await supabase
      .from("document_shares")
      .select("permission")
      .eq("document_id", id)
      .eq("shared_with_user_id", userId)
      .maybeSingle();

    if (!share) throw new Error("DOCUMENT_NOT_SHARED");
  }

  const { data: signedUrlData, error } = await createAdminClient()
    .storage.from("documents")
    .createSignedUrl(document.storage_path, SIGNED_URL_TTL_SECONDS);

  if (error || !signedUrlData?.signedUrl) throw new Error("SIGNED_URL_FAILED");
  return {
    signedUrl: signedUrlData.signedUrl,
    expiresIn: SIGNED_URL_TTL_SECONDS,
  };
}

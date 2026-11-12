import "server-only";

import type { z } from "zod";

import { deleteDocumentResponseSchema } from "@/contracts";
import { requireUser } from "@/lib/auth/require-user";
import { AppError } from "@/lib/http/app-error";
import { createAdminClient } from "@/lib/supabase/admin";

const STORAGE_BUCKET = "documents";

const LUMEN_NOTE =
  "The document, its file, and all derived data have been deleted. The copy " +
  "held by the Lumen OCR provider cannot be deleted through this API.";

/** Data-access seam so unit tests run against in-memory fakes. */
export type DeleteDocumentDeps = {
  /** Load the row only if the caller owns it; a non-owner gets null. */
  loadOwned: (
    userId: string,
    documentId: string,
  ) => Promise<{ storage_path: string } | null>;
  removeObject: (paths: string[]) => Promise<void>;
  deleteRow: (documentId: string) => Promise<void>;
};

/**
 * Delete a document: remove the Storage object and the row (cascades to pages,
 * analyses, findings, evidence, and jobs). Ownership is required — a recipient
 * or stranger gets NOT_FOUND, never FORBIDDEN, so existence is not revealed.
 */
export async function deleteDocument(
  userId: string,
  documentId: string,
  deps: DeleteDocumentDeps = defaultDeps(),
): Promise<z.infer<typeof deleteDocumentResponseSchema>> {
  const document = await deps.loadOwned(userId, documentId);
  if (!document) throw new AppError("NOT_FOUND");

  // Remove the object first; the row delete cascades the derived data.
  await deps.removeObject([document.storage_path]);
  await deps.deleteRow(documentId);

  return deleteDocumentResponseSchema.parse({ documentId, note: LUMEN_NOTE });
}

function defaultDeps(): DeleteDocumentDeps {
  const admin = createAdminClient();
  return {
    async loadOwned(userId, documentId) {
      // The user client enforces RLS, but delete runs through the service
      // role, so ownership is checked explicitly here (owner-only, not a
      // share recipient).
      const { supabase } = await requireUser();
      const { data } = await supabase
        .from("documents")
        .select("storage_path, user_id")
        .eq("id", documentId)
        .maybeSingle();
      if (!data || data.user_id !== userId) return null;
      return { storage_path: data.storage_path as string };
    },
    async removeObject(paths) {
      const { error } = await admin.storage
        .from(STORAGE_BUCKET)
        .remove(paths);
      if (error) throw new AppError("PROVIDER_UNAVAILABLE");
    },
    async deleteRow(documentId) {
      const { error } = await admin
        .from("documents")
        .delete()
        .eq("id", documentId);
      if (error) throw error;
    },
  };
}

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { canTransition, type DocumentLifecycle } from "@/contracts";
import { AppError } from "@/lib/http/app-error";

/**
 * Compare-and-set lifecycle transition. The update only matches the row when
 * it is still in `from`, so two concurrent transitions cannot both win. A
 * disallowed transition is rejected before any query so a bad caller never
 * touches the database.
 */
export async function transitionDocument(
  admin: SupabaseClient,
  documentId: string,
  from: DocumentLifecycle,
  to: DocumentLifecycle,
): Promise<void> {
  if (!canTransition(from, to)) throw new AppError("CONFLICT");

  const { count, error } = await admin
    .from("documents")
    .update({ processing_status: to }, { count: "exact" })
    .eq("id", documentId)
    .eq("processing_status", from);

  if (error || !count) throw new AppError("CONFLICT");
}

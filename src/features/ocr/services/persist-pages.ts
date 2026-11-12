import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { NormalizedPage } from "@/lib/providers/ocr-provider";

/**
 * Upsert OCR pages by (document_id, page_number) so a rerun overwrites rather
 * than duplicates. The per-word list goes in page_metadata; it is OCR output,
 * not content that may be logged, and never leaves these rows.
 */
export async function persistPages(
  admin: SupabaseClient,
  documentId: string,
  userId: string,
  pages: NormalizedPage[],
): Promise<void> {
  const rows = pages.map((page) => ({
    document_id: documentId,
    user_id: userId,
    page_number: page.pageNumber,
    extracted_text: page.text,
    ocr_status: page.status,
    average_confidence: page.averageConfidence,
    page_metadata: { words: page.words },
  }));

  const { error } = await admin
    .from("document_pages")
    .upsert(rows, { onConflict: "document_id,page_number" });
  if (error) throw error;
}

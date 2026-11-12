import "server-only";

import { listCorrectionsResponseSchema } from "@/contracts";
import { AppError } from "@/lib/http/app-error";
import { createAdminClient } from "@/lib/supabase/admin";
import type { z } from "zod";

/** A stored correction row for the history listing. */
export type CorrectionHistoryRow = {
  id: string;
  page_number: number;
  word_start: number;
  word_end: number;
  original_value: string;
  corrected_value: string | null;
  created_at: string;
};

/** Data-access seam so unit tests run against in-memory fakes. */
export type ListCorrectionsDeps = {
  /** Owner of the document, or null when it does not exist. */
  loadDocumentOwner: (documentId: string) => Promise<string | null>;
  /** All corrections for the document, oldest first (full history). */
  loadCorrections: (documentId: string) => Promise<CorrectionHistoryRow[]>;
};

/**
 * The full correction history for a document — both superseded and current
 * rows. Owner only: a recipient or stranger gets NOT_FOUND.
 */
export async function listCorrections(
  userId: string,
  documentId: string,
  deps: ListCorrectionsDeps = defaultDeps(),
): Promise<z.infer<typeof listCorrectionsResponseSchema>> {
  const owner = await deps.loadDocumentOwner(documentId);
  if (owner !== userId) throw new AppError("NOT_FOUND");

  const rows = await deps.loadCorrections(documentId);
  return listCorrectionsResponseSchema.parse({
    corrections: rows.map((row) => ({
      id: row.id,
      pageNumber: row.page_number,
      wordStart: row.word_start,
      wordEnd: row.word_end,
      originalText: row.original_value,
      correctedValue: row.corrected_value,
      createdAt: row.created_at,
    })),
  });
}

function defaultDeps(): ListCorrectionsDeps {
  const admin = createAdminClient();
  return {
    async loadDocumentOwner(documentId) {
      const { data } = await admin
        .from("documents")
        .select("user_id")
        .eq("id", documentId)
        .maybeSingle();
      return (data?.user_id as string | undefined) ?? null;
    },
    async loadCorrections(documentId) {
      const { data, error } = await admin
        .from("ocr_corrections")
        .select(
          "id, page_number, word_start, word_end, original_value, corrected_value, created_at",
        )
        .eq("document_id", documentId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CorrectionHistoryRow[];
    },
  };
}

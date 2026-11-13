import "server-only";

import { cache } from "react";

import { listDocuments } from "@/features/documents/services/document-queries";
import { requireUser } from "@/lib/auth/require-user";

export const RECENT_DOCUMENTS_LIMIT = 5;

export interface RecentDocument {
  readonly id: string;
  readonly title: string;
}

export type RecentDocumentsResult =
  | { readonly status: "ok"; readonly documents: readonly RecentDocument[] }
  | { readonly status: "unavailable" };

export interface RecentDocumentsDeps {
  requireUser(): Promise<{ userId: string }>;
  listDocuments(
    userId: string,
  ): Promise<{ documents: readonly { documentId: string; title: string }[] }>;
}

const defaultDeps: RecentDocumentsDeps = { requireUser, listDocuments };

/**
 * First five documents of the signed-in user's own list, in the order
 * `listDocuments` returns them. Any failure becomes `unavailable` so the
 * sidebar degrades quietly; the error itself is never surfaced.
 */
export async function fetchRecentDocuments(
  deps: RecentDocumentsDeps = defaultDeps,
): Promise<RecentDocumentsResult> {
  try {
    const { userId } = await deps.requireUser();
    const { documents } = await deps.listDocuments(userId);
    return {
      status: "ok",
      documents: documents.slice(0, RECENT_DOCUMENTS_LIMIT).map((document) => ({
        id: document.documentId,
        title: document.title,
      })),
    };
  } catch {
    return { status: "unavailable" };
  }
}

/** Deduplicated per request: the desktop and mobile sidebars share one read. */
export const getRecentDocuments = cache(() => fetchRecentDocuments());

import { z } from "zod";

import { apiFetch } from "@/lib/api-client/client";

/**
 * Response of GET /api/documents/:id/signed-url (see
 * src/app/api/documents/[documentId]/signed-url/route.ts). The URL is valid
 * for `expiresIn` seconds (60 today), so it must be fetched at click time.
 */
export const signedUrlResponseSchema = z.object({
  signedUrl: z.string().min(1),
  expiresIn: z.number().positive(),
});
export type SignedUrlResponse = z.infer<typeof signedUrlResponseSchema>;

export function getDocumentSignedUrl(
  documentId: string,
): Promise<SignedUrlResponse> {
  return apiFetch(`/api/documents/${documentId}/signed-url`, {
    schema: signedUrlResponseSchema,
  });
}

/** Only http(s) URLs are ever opened, so a `javascript:` URL cannot slip in. */
export function isSafeOpenUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

/** The small part of a browser window this module needs. */
export interface OpenedTab {
  opener: unknown;
  location: { href: string };
  close(): void;
}

export interface OpenOriginalFileDeps {
  fetchSignedUrl: (documentId: string) => Promise<SignedUrlResponse>;
  /** Opens a tab. The viewer passes `window.open`. */
  openTab: (url: string, target: string) => OpenedTab | null;
}

export type OpenOriginalFileResult = "opened" | "blocked";

/**
 * Opens the original file in a new tab. The tab is opened synchronously inside
 * the click (so pop-up blockers allow it), its `opener` is cleared, and it is
 * pointed at the signed URL once that arrives. If the fetch fails the blank
 * tab is closed and the error is rethrown for the caller to show as safe copy.
 */
export async function openOriginalFile(
  documentId: string,
  deps: OpenOriginalFileDeps,
): Promise<OpenOriginalFileResult> {
  const tab = deps.openTab("", "_blank");
  if (tab) tab.opener = null;

  try {
    const { signedUrl } = await deps.fetchSignedUrl(documentId);
    if (!isSafeOpenUrl(signedUrl)) {
      throw new Error("Unsafe signed URL.");
    }
    if (tab) {
      tab.location.href = signedUrl;
      return "opened";
    }
    // The first attempt was blocked. Try once more with the real URL. Without
    // the noopener feature the handle is returned, so a null result really
    // means blocked, and the opener is cleared by hand.
    const retry = deps.openTab(signedUrl, "_blank");
    if (!retry) return "blocked";
    retry.opener = null;
    return "opened";
  } catch (error) {
    tab?.close();
    throw error;
  }
}

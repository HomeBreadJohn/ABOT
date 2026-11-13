/**
 * Family-sharing endpoints (owner side). Schemas are local to
 * `@/features/sharing/schemas` because the shared contract has no share types.
 * This file is not re-exported from ./index; import it directly:
 * `import { listShares } from "@/lib/api-client/shares"`.
 */
import {
  inviteShareResponseSchema,
  listSharesResponseSchema,
  revokeShareResponseSchema,
  type InviteShareRequest,
  type InviteShareResponse,
  type ListSharesResponse,
  type RevokeShareResponse,
} from "@/features/sharing/schemas";
import { apiFetch } from "@/lib/api-client/client";

function sharesPath(documentId: string): string {
  return `/api/documents/${encodeURIComponent(documentId)}/shares`;
}

/** GET /api/documents/:id/shares — the owner's shares for this document. */
export function listShares(documentId: string): Promise<ListSharesResponse> {
  return apiFetch(sharesPath(documentId), {
    schema: listSharesResponseSchema,
  });
}

/**
 * POST /api/documents/:id/shares — invite by email. The response is the same
 * whether or not the email has an account; do not imply an email was sent.
 */
export function inviteToShare(
  documentId: string,
  input: InviteShareRequest,
): Promise<InviteShareResponse> {
  return apiFetch(sharesPath(documentId), {
    method: "POST",
    body: input,
    schema: inviteShareResponseSchema,
  });
}

/** DELETE /api/documents/:id/shares/:shareId — revoke one share. */
export function revokeShare(
  documentId: string,
  shareId: string,
): Promise<RevokeShareResponse> {
  return apiFetch(`${sharesPath(documentId)}/${encodeURIComponent(shareId)}`, {
    method: "DELETE",
    schema: revokeShareResponseSchema,
  });
}

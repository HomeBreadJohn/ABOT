import {
  INVITE_RESPONSE_MESSAGE,
  inviteShareResponseSchema,
  listSharesResponseSchema,
  revokeShareResponseSchema,
  type InviteShareRequest,
  type InviteShareResponse,
  type ListSharesResponse,
  type RevokeShareResponse,
  type SharePermission,
} from "@/features/sharing/schemas";
import { AppError } from "@/lib/http/app-error";

/** A `document_shares` row as the owner is allowed to see it. */
export type ShareRow = {
  id: string;
  document_id: string;
  permission: SharePermission;
  created_at: string;
};

export type InsertShareResult = "CREATED" | "DUPLICATE";

/**
 * Data-access seam so unit tests run against in-memory fakes. The default
 * implementation (share-deps.ts) uses the user-scoped Supabase client, so RLS
 * applies on top of the explicit owner filters below.
 */
export type SharesDeps = {
  /** True only if `userId` OWNS the document (a share recipient gets false). */
  ownsDocument: (userId: string, documentId: string) => Promise<boolean>;
  listShares: (userId: string, documentId: string) => Promise<ShareRow[]>;
  insertShare: (input: {
    documentId: string;
    ownerId: string;
    sharedWithUserId: string;
    permission: SharePermission;
  }) => Promise<InsertShareResult>;
  /** Deletes only a share row owned by `userId`; returns whether one was deleted. */
  deleteShare: (
    userId: string,
    documentId: string,
    shareId: string,
  ) => Promise<boolean>;
  /** Server-only email lookup (see resolve-recipient.ts). Returns a user id or null. */
  resolveRecipientByEmail: (email: string) => Promise<string | null>;
  /** Per-owner invite limiter; false when the owner is over the limit. */
  consumeInviteQuota: (ownerId: string) => boolean;
};

/** Owner-only list. A non-owner (including a recipient) gets NOT_FOUND. */
export async function listShares(
  userId: string,
  documentId: string,
  deps: SharesDeps,
): Promise<ListSharesResponse> {
  await requireOwner(userId, documentId, deps);
  const rows = await deps.listShares(userId, documentId);

  return listSharesResponseSchema.parse({
    shares: rows.map((row) => ({
      shareId: row.id,
      documentId: row.document_id,
      permission: row.permission,
      createdAt: new Date(row.created_at).toISOString(),
    })),
  });
}

/**
 * Invite an email to a document.
 *
 * Every non-error outcome returns the SAME body, so a caller cannot tell
 * whether the email has an account:
 *  - unknown email            -> nothing is written, uniform response
 *  - known email, new         -> share row inserted, uniform response
 *  - known email, already shared -> rejected without a write, uniform response
 *
 * Duplicates are rejected without a write but are NOT reported as an error:
 * a distinct duplicate error would let an owner invite twice and learn that
 * the address has an account (first call 200 either way, second call 409 only
 * for real accounts). The only distinct error is inviting yourself, which
 * reveals nothing about anyone else.
 *
 * The owner id always comes from the session (`userId`); the recipient id is
 * resolved server-side and never leaves this function.
 */
export async function inviteToShare(
  userId: string,
  documentId: string,
  input: InviteShareRequest,
  deps: SharesDeps,
): Promise<InviteShareResponse> {
  await requireOwner(userId, documentId, deps);

  // Counted before the lookup so every probe, including failed ones, spends quota.
  if (!deps.consumeInviteQuota(userId)) {
    throw new AppError(
      "RATE_LIMITED",
      "Too many invitations. Please try again later.",
    );
  }

  const recipientId = await deps.resolveRecipientByEmail(input.email);

  if (recipientId === userId) {
    throw new AppError(
      "INVALID_REQUEST",
      "You can't share a document with yourself.",
    );
  }

  if (recipientId) {
    // CREATED and DUPLICATE are intentionally indistinguishable to the caller.
    await deps.insertShare({
      documentId,
      ownerId: userId,
      sharedWithUserId: recipientId,
      permission: input.permission,
    });
  }

  return inviteShareResponseSchema.parse({
    status: "ACCEPTED",
    message: INVITE_RESPONSE_MESSAGE,
  });
}

/**
 * Revoke one share. Only the owner's own share rows can be deleted; anything
 * else (wrong document, someone else's share, unknown id) is NOT_FOUND.
 */
export async function revokeShare(
  userId: string,
  documentId: string,
  shareId: string,
  deps: SharesDeps,
): Promise<RevokeShareResponse> {
  await requireOwner(userId, documentId, deps);

  const deleted = await deps.deleteShare(userId, documentId, shareId);
  if (!deleted) throw new AppError("NOT_FOUND");

  return revokeShareResponseSchema.parse({ shareId, documentId });
}

async function requireOwner(
  userId: string,
  documentId: string,
  deps: SharesDeps,
): Promise<void> {
  // NOT_FOUND, never FORBIDDEN, so a stranger or recipient cannot confirm
  // that the document exists.
  if (!(await deps.ownsDocument(userId, documentId))) {
    throw new AppError("NOT_FOUND");
  }
}

/**
 * Request and response schemas for the family-sharing routes.
 *
 * These live here (not in `@/contracts`) because the shared contract is owned
 * by Person 2 and is not edited by Person 1. If the contract later adds share
 * schemas, replace these with re-exports. This module is client-safe (no
 * server-only imports) so the browser api-client can validate with it.
 */
import { z } from "zod";

export const sharePermissionSchema = z.enum(["viewer", "editor"]);
export type SharePermission = z.infer<typeof sharePermissionSchema>;

/** Route params. Malformed ids are rejected before they reach Postgres. */
export const documentSharesParamsSchema = z.strictObject({
  documentId: z.uuid(),
});

export const revokeShareParamsSchema = z.strictObject({
  documentId: z.uuid(),
  shareId: z.uuid(),
});

/**
 * POST /api/documents/:id/shares
 *
 * Strict: any extra key (`ownerId`, `sharedWithUserId`, `userId`, ...) fails
 * validation. The owner always comes from the session, never from the body.
 */
export const inviteShareRequestSchema = z.strictObject({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  permission: sharePermissionSchema,
});
export type InviteShareRequest = z.infer<typeof inviteShareRequestSchema>;

/** Fixed copy: makes no claim that an email was sent or that an account exists. */
export const INVITE_RESPONSE_MESSAGE =
  "If this person has an account, they will see the document.";

/**
 * The invite response is identical for every non-error outcome (unknown email,
 * known email, already shared) so the endpoint cannot be used to find out
 * which emails have accounts.
 */
export const inviteShareResponseSchema = z.strictObject({
  status: z.literal("ACCEPTED"),
  message: z.literal(INVITE_RESPONSE_MESSAGE),
});
export type InviteShareResponse = z.infer<typeof inviteShareResponseSchema>;

/**
 * One share as the owner sees it. Deliberately has no recipient id, email or
 * name: the owner learns nothing about the recipient beyond what they typed.
 */
export const shareSchema = z.strictObject({
  shareId: z.uuid(),
  documentId: z.uuid(),
  permission: sharePermissionSchema,
  createdAt: z.iso.datetime(),
});
export type Share = z.infer<typeof shareSchema>;

/** GET /api/documents/:id/shares */
export const listSharesResponseSchema = z.strictObject({
  shares: z.array(shareSchema),
});
export type ListSharesResponse = z.infer<typeof listSharesResponseSchema>;

/** DELETE /api/documents/:id/shares/:shareId */
export const revokeShareResponseSchema = z.strictObject({
  shareId: z.uuid(),
  documentId: z.uuid(),
});
export type RevokeShareResponse = z.infer<typeof revokeShareResponseSchema>;

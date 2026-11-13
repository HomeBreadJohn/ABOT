import "server-only";

import { z } from "zod";

import { sharePermissionSchema } from "@/features/sharing/schemas";
import { inviteRateLimiter } from "@/features/sharing/services/invite-rate-limit";
import { resolveRecipientByEmail } from "@/features/sharing/services/resolve-recipient";
import type { ShareRow, SharesDeps } from "@/features/sharing/services/shares";
import { AppError } from "@/lib/http/app-error";
import type { createClient } from "@/lib/supabase/server";

type UserClient = Pick<Awaited<ReturnType<typeof createClient>>, "from">;

const shareRowSchema = z.object({
  id: z.uuid(),
  document_id: z.uuid(),
  permission: sharePermissionSchema,
  created_at: z.string(),
});

const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";
const RLS_VIOLATION = "42501";

/**
 * Production deps. Every query runs through the caller's session client, so
 * RLS (owner-only writes via `owns_document`) is the authority. The explicit
 * `user_id` / `owner_id` filters are defence in depth AND necessary where RLS
 * alone is too permissive: recipients may also SELECT the document and its
 * share rows, so "can I see it" is not the same as "do I own it".
 *
 * The recipient lookup is the only privileged step and lives behind
 * `resolveRecipientByEmail` (service-role, interim; see resolve-recipient.ts).
 */
export function createShareDeps(supabase: UserClient): SharesDeps {
  return {
    async ownsDocument(userId, documentId) {
      const { data, error } = await supabase
        .from("documents")
        .select("id")
        .eq("id", documentId)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw new Error("share ownership check failed");
      return data !== null;
    },

    async listShares(userId, documentId) {
      const { data, error } = await supabase
        .from("document_shares")
        .select("id, document_id, permission, created_at")
        .eq("document_id", documentId)
        .eq("owner_id", userId)
        .order("created_at", { ascending: true });
      if (error) throw new Error("share list failed");
      return z.array(shareRowSchema).parse(data ?? []) satisfies ShareRow[];
    },

    async insertShare({ documentId, ownerId, sharedWithUserId, permission }) {
      const { error } = await supabase.from("document_shares").insert({
        document_id: documentId,
        owner_id: ownerId,
        shared_with_user_id: sharedWithUserId,
        permission,
      });
      if (!error) return "CREATED";
      if (error.code === UNIQUE_VIOLATION) return "DUPLICATE";
      // owner_id <> shared_with_user_id; the service rejects self-invites first.
      if (error.code === CHECK_VIOLATION) {
        throw new AppError(
          "INVALID_REQUEST",
          "You can't share a document with yourself.",
        );
      }
      if (error.code === RLS_VIOLATION) throw new AppError("NOT_FOUND");
      throw new Error("share insert failed");
    },

    async deleteShare(userId, documentId, shareId) {
      const { data, error } = await supabase
        .from("document_shares")
        .delete()
        .eq("id", shareId)
        .eq("document_id", documentId)
        .eq("owner_id", userId)
        .select("id");
      if (error) throw new Error("share delete failed");
      return (data?.length ?? 0) > 0;
    },

    resolveRecipientByEmail,
    consumeInviteQuota: (ownerId) => inviteRateLimiter.consume(ownerId),
  };
}

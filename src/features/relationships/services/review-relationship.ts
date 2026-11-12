import "server-only";

import type { z } from "zod";

import {
  reviewRelationshipResponseSchema,
  type RelationshipType,
} from "@/contracts";
import { AppError } from "@/lib/http/app-error";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Review a suggested relationship. APPROVE promotes it to CONFIRMED_MATCH (only
 * a user approval can do this). REJECT stores REJECTED so the same pair is not
 * suggested again; the stored relationship_type is left untouched. Both
 * documents in the pair must be owned by or shared with the user, else
 * NOT_FOUND (never FORBIDDEN).
 */

type ApprovalStatus = "APPROVED" | "REJECTED";

/** Data-access seam so unit tests run against in-memory fakes. */
export type ReviewRelationshipDeps = {
  loadRelationship: (
    relationshipId: string,
  ) => Promise<{ sourceDocumentId: string; targetDocumentId: string } | null>;
  /** True when the user owns or is shared the document. */
  authorize: (userId: string, documentId: string) => Promise<boolean>;
  /**
   * Set approval_status; when a relationshipType is given, also set
   * relationship_type. Returns the resulting relationship_type.
   */
  setApproval: (
    relationshipId: string,
    status: ApprovalStatus,
    relationshipType?: RelationshipType,
  ) => Promise<RelationshipType>;
};

export async function reviewRelationship(
  userId: string,
  relationshipId: string,
  action: "APPROVE" | "REJECT",
  deps: ReviewRelationshipDeps = defaultDeps(),
): Promise<z.infer<typeof reviewRelationshipResponseSchema>> {
  const relationship = await deps.loadRelationship(relationshipId);
  if (!relationship) throw new AppError("NOT_FOUND");

  const [okSource, okTarget] = await Promise.all([
    deps.authorize(userId, relationship.sourceDocumentId),
    deps.authorize(userId, relationship.targetDocumentId),
  ]);
  if (!okSource || !okTarget) throw new AppError("NOT_FOUND");

  const type =
    action === "APPROVE"
      ? await deps.setApproval(relationshipId, "APPROVED", "CONFIRMED_MATCH")
      : await deps.setApproval(relationshipId, "REJECTED", undefined);

  return reviewRelationshipResponseSchema.parse({ relationshipId, type });
}

/* -------------------------------------------------------------------------- */
/* Production data access via the service-role admin client. The owner-or-     */
/* shared check above is the real authorization gate.                          */
/* -------------------------------------------------------------------------- */

function defaultDeps(): ReviewRelationshipDeps {
  const admin = createAdminClient();
  return {
    async loadRelationship(relationshipId) {
      const { data } = await admin
        .from("document_relationships")
        .select("source_document_id, target_document_id")
        .eq("id", relationshipId)
        .maybeSingle();
      if (!data) return null;
      return {
        sourceDocumentId: data.source_document_id as string,
        targetDocumentId: data.target_document_id as string,
      };
    },
    async authorize(userId, documentId) {
      const { data: doc } = await admin
        .from("documents")
        .select("user_id")
        .eq("id", documentId)
        .maybeSingle();
      if (!doc) return false;
      if (doc.user_id === userId) return true;
      const { data: share } = await admin
        .from("document_shares")
        .select("id")
        .eq("document_id", documentId)
        .eq("shared_with_user_id", userId)
        .maybeSingle();
      return Boolean(share);
    },
    async setApproval(relationshipId, status, relationshipType) {
      const patch: { approval_status: ApprovalStatus; relationship_type?: RelationshipType } = {
        approval_status: status,
      };
      if (relationshipType) patch.relationship_type = relationshipType;
      const { data, error } = await admin
        .from("document_relationships")
        .update(patch)
        .eq("id", relationshipId)
        .select("relationship_type")
        .single();
      if (error) throw error;
      return data.relationship_type as RelationshipType;
    },
  };
}

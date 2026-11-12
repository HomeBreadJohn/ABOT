import { reviewRelationshipRequestSchema } from "@/contracts";
import { apiOk, withApiErrors } from "@/lib/http/api-response";
import { requireUser } from "@/lib/auth/require-user";

import { reviewRelationship } from "@/features/relationships/services/review-relationship";

// Approve or reject a suggested relationship. APPROVE promotes it to
// CONFIRMED_MATCH; REJECT stores REJECTED so the pair is not suggested again.
export const POST = withApiErrors(async (request: Request) => {
  const { userId } = await requireUser();
  const { relationshipId, action } = reviewRelationshipRequestSchema.parse(
    await request.json(),
  );
  return apiOk(await reviewRelationship(userId, relationshipId, action));
});

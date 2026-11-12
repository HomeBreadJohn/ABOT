import { suggestRelationshipsRequestSchema } from "@/contracts";
import { apiOk, withApiErrors } from "@/lib/http/api-response";
import { requireUser } from "@/lib/auth/require-user";

import { suggestRelationships } from "@/features/relationships/services/suggest-relationships";

// Suggest relationships between two documents using deterministic identifier
// matching only (no AI). Every suggestion is POSSIBLE_MATCH.
export const POST = withApiErrors(async (request: Request) => {
  const { userId } = await requireUser();
  const { documentIdA, documentIdB } = suggestRelationshipsRequestSchema.parse(
    await request.json(),
  );
  return apiOk(await suggestRelationships(userId, documentIdA, documentIdB));
});

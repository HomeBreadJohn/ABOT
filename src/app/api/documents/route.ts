import { createDocumentRequestSchema } from "@/contracts";
import { apiOk, withApiErrors } from "@/lib/http/api-response";
import { requireUser } from "@/lib/auth/require-user";

import { registerDocument } from "@/features/documents/services/register-document";

// Metadata only: the browser uploads the file straight to Storage with the
// returned signed URL, so this route never receives file bytes.
export const POST = withApiErrors(async (request: Request) => {
  const { userId } = await requireUser();
  const input = createDocumentRequestSchema.parse(await request.json());
  return apiOk(await registerDocument(userId, input));
});

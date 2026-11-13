import {
  documentSharesParamsSchema,
  inviteShareRequestSchema,
} from "@/features/sharing/schemas";
import { createShareDeps } from "@/features/sharing/services/share-deps";
import { inviteToShare, listShares } from "@/features/sharing/services/shares";
import { requireUser } from "@/lib/auth/require-user";
import { apiOk, withApiErrors } from "@/lib/http/api-response";
import { AppError } from "@/lib/http/app-error";

type Ctx = { params: Promise<{ documentId: string }> };

// Owner-only list of who a document is shared with (permission and date only).
export const GET = withApiErrors(async (_request: Request, { params }: Ctx) => {
  const { userId, supabase } = await requireUser();
  const documentId = parseDocumentId(await params);
  return apiOk(await listShares(userId, documentId, createShareDeps(supabase)));
});

// Invite by email. The response is identical whether or not the email has an
// account. The owner is the session user; the body can never carry owner ids.
export const POST = withApiErrors(async (request: Request, { params }: Ctx) => {
  const { userId, supabase } = await requireUser();
  const documentId = parseDocumentId(await params);
  const body = await request.json().catch(() => {
    throw new AppError("INVALID_REQUEST", "Request body must be valid JSON.");
  });
  const input = inviteShareRequestSchema.parse(body);
  return apiOk(
    await inviteToShare(userId, documentId, input, createShareDeps(supabase)),
  );
});

// A malformed id cannot match any document, so it is NOT_FOUND like any other miss.
function parseDocumentId(params: { documentId: string }): string {
  const parsed = documentSharesParamsSchema.safeParse(params);
  if (!parsed.success) throw new AppError("NOT_FOUND");
  return parsed.data.documentId;
}

import { revokeShareParamsSchema } from "@/features/sharing/schemas";
import { createShareDeps } from "@/features/sharing/services/share-deps";
import { revokeShare } from "@/features/sharing/services/shares";
import { requireUser } from "@/lib/auth/require-user";
import { apiOk, withApiErrors } from "@/lib/http/api-response";
import { AppError } from "@/lib/http/app-error";

type Ctx = { params: Promise<{ documentId: string; shareId: string }> };

// Revoke one share. Owner only; any other caller or id gets NOT_FOUND.
export const DELETE = withApiErrors(
  async (_request: Request, { params }: Ctx) => {
    const { userId, supabase } = await requireUser();
    const parsed = revokeShareParamsSchema.safeParse(await params);
    // A malformed id cannot match a row, so it is NOT_FOUND like any other miss.
    if (!parsed.success) throw new AppError("NOT_FOUND");
    const { documentId, shareId } = parsed.data;
    return apiOk(
      await revokeShare(userId, documentId, shareId, createShareDeps(supabase)),
    );
  },
);

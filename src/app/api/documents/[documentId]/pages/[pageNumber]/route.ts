import { apiOk, withApiErrors } from "@/lib/http/api-response";
import { requireUser } from "@/lib/auth/require-user";
import { AppError } from "@/lib/http/app-error";

import { getPage } from "@/features/documents/services/document-queries";

// Page text and words for evidence navigation. RLS limits visibility to the
// owner and share recipients; anyone else gets NOT_FOUND.
export const GET = withApiErrors(
  async (
    _request: Request,
    { params }: { params: Promise<{ documentId: string; pageNumber: string }> },
  ) => {
    const { userId } = await requireUser();
    const { documentId, pageNumber } = await params;
    const page = Number(pageNumber);
    if (!Number.isInteger(page) || page < 1) throw new AppError("NOT_FOUND");
    return apiOk(await getPage(userId, documentId, page));
  },
);

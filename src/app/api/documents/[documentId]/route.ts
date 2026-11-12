import { updateDocumentRequestSchema } from "@/contracts";
import { apiOk, withApiErrors } from "@/lib/http/api-response";
import { requireUser } from "@/lib/auth/require-user";

import {
  getDocument,
  updateDocument,
} from "@/features/documents/services/document-queries";
import { deleteDocument } from "@/features/documents/services/delete-document";

type Ctx = { params: Promise<{ documentId: string }> };

// Detail and processing status.
export const GET = withApiErrors(async (_request: Request, { params }: Ctx) => {
  const { userId } = await requireUser();
  const { documentId } = await params;
  return apiOk(await getDocument(userId, documentId));
});

// Update the title or confirm the category; a category change on a completed
// document may enqueue a REANALYZE.
export const PATCH = withApiErrors(
  async (request: Request, { params }: Ctx) => {
    const { userId } = await requireUser();
    const { documentId } = await params;
    const input = updateDocumentRequestSchema.parse(await request.json());
    const origin = new URL(request.url).origin;
    return apiOk(await updateDocument(userId, documentId, input, origin));
  },
);

// Delete the document, its file, and all derived data.
export const DELETE = withApiErrors(
  async (_request: Request, { params }: Ctx) => {
    const { userId } = await requireUser();
    const { documentId } = await params;
    return apiOk(await deleteDocument(userId, documentId));
  },
);

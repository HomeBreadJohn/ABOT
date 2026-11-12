import { apiOk, withApiErrors } from "@/lib/http/api-response";

import { createDocumentSignedUrl } from "@/features/documents/services/create-signed-url";

export const GET = withApiErrors(
  async (
    _request: Request,
    { params }: { params: Promise<{ documentId: string }> },
  ) => {
    const { documentId } = await params;
    return apiOk(await createDocumentSignedUrl(documentId));
  },
);

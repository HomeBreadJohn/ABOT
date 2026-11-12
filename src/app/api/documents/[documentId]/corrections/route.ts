import { submitCorrectionsRequestSchema } from "@/contracts";
import { apiOk, withApiErrors } from "@/lib/http/api-response";
import { requireUser } from "@/lib/auth/require-user";

import { submitCorrections } from "@/features/corrections/services/submit-corrections";
import { listCorrections } from "@/features/corrections/services/list-corrections";

// Submit OCR corrections for a document. Each item targets a word range; the
// original OCR words and the corrected value are stored as a new row, and a
// REANALYZE is enqueued once every REQUIRED review item is resolved.
export const POST = withApiErrors(
  async (
    request: Request,
    { params }: { params: Promise<{ documentId: string }> },
  ) => {
    const { userId } = await requireUser();
    const { documentId } = await params;
    const input = submitCorrectionsRequestSchema.parse(await request.json());
    const origin = new URL(request.url).origin;
    return apiOk(await submitCorrections(userId, documentId, input, origin));
  },
);

// The full correction history for a document (superseded and current), owner only.
export const GET = withApiErrors(
  async (
    _request: Request,
    { params }: { params: Promise<{ documentId: string }> },
  ) => {
    const { userId } = await requireUser();
    const { documentId } = await params;
    return apiOk(await listCorrections(userId, documentId));
  },
);

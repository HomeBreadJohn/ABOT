import { NextResponse } from "next/server";

import { createDocumentSignedUrl } from "@/features/documents/services/create-signed-url";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  try {
    const { documentId } = await params;
    return NextResponse.json(await createDocumentSignedUrl(documentId));
  } catch (error) {
    const code = error instanceof Error ? error.message : "SIGNED_URL_FAILED";
    const status =
      code === "AUTHENTICATION_REQUIRED"
        ? 401
        : code === "DOCUMENT_NOT_FOUND" || code === "DOCUMENT_NOT_SHARED"
          ? 404
          : 400;
    return NextResponse.json(
      { error: "Unable to create a document access URL." },
      { status },
    );
  }
}

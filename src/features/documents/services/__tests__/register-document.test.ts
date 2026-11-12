import { describe, expect, it, vi } from "vitest";

import { registerDocument } from "@/features/documents/services/register-document";

const USER_ID = "11111111-1111-1111-1111-111111111111";

/**
 * Fake admin client: captures the inserted document row and returns a signed
 * upload URL for whatever path the service asks for.
 */
function fakeAdmin() {
  const inserts: Record<string, unknown>[] = [];
  const createSignedUploadUrl = vi.fn(async (path: string) => ({
    data: { signedUrl: `https://storage.test/upload/${path}`, token: "tok", path },
    error: null,
  }));
  const insert = vi.fn((row: Record<string, unknown>) => {
    inserts.push(row);
    return {
      select: () => ({
        single: async () => ({ data: { id: row.id }, error: null }),
      }),
    };
  });
  const admin = {
    from: vi.fn(() => ({ insert })),
    storage: { from: vi.fn(() => ({ createSignedUploadUrl })) },
  } as never;
  return { admin, inserts, createSignedUploadUrl };
}

describe("registerDocument", () => {
  it("creates an AWAITING_UPLOAD row and returns all four response fields", async () => {
    const { admin, inserts } = fakeAdmin();

    const result = await registerDocument(
      USER_ID,
      {
        originalFilename: "bill.pdf",
        mimeType: "application/pdf",
        fileSize: 1024,
      },
      { admin },
    );

    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      user_id: USER_ID,
      processing_status: "AWAITING_UPLOAD",
      mime_type: "application/pdf",
      file_size: 1024,
      original_filename: "bill.pdf",
      ocr_document_id: null,
      classification_confidence: null,
    });

    expect(result.documentId).toEqual(inserts[0].id);
    expect(result.storagePath).toBe(`${USER_ID}/${inserts[0].id}/bill.pdf`);
    expect(result.uploadToken).toBe("tok");
    expect(result.uploadUrl).toContain("https://storage.test/upload/");
  });

  it("builds a storage path of <userId>/<documentId>/<safe filename>", async () => {
    const { admin, inserts } = fakeAdmin();

    const result = await registerDocument(
      USER_ID,
      { originalFilename: "report.png", mimeType: "image/png", fileSize: 10 },
      { admin },
    );

    expect(result.storagePath).toBe(
      `${USER_ID}/${inserts[0].id}/report.png`,
    );
  });

  it("strips path separators, traversal, and control characters from the filename", async () => {
    const { admin, inserts } = fakeAdmin();

    await registerDocument(
      USER_ID,
      {
        originalFilename: "../../etc\\pass\u0000wd.pdf",
        mimeType: "application/pdf",
        fileSize: 10,
      },
      { admin },
    );

    const safe = String(inserts[0].storage_path).split("/").pop()!;
    expect(safe).not.toContain("/");
    expect(safe).not.toContain("\\");
    expect(safe).not.toContain("..");
    expect(safe).not.toMatch(/[\u0000-\u001f]/);
    expect(safe.length).toBeGreaterThan(0);
  });

  it("caps the safe filename at 120 characters", async () => {
    const { admin, inserts } = fakeAdmin();

    await registerDocument(
      USER_ID,
      {
        originalFilename: "a".repeat(200) + ".pdf",
        mimeType: "application/pdf",
        fileSize: 10,
      },
      { admin },
    );

    const safe = String(inserts[0].storage_path).split("/").pop()!;
    expect(safe.length).toBeLessThanOrEqual(120);
  });

  it("rejects an oversize file before touching storage", async () => {
    const { admin, createSignedUploadUrl } = fakeAdmin();

    await expect(
      registerDocument(
        USER_ID,
        {
          originalFilename: "big.pdf",
          mimeType: "application/pdf",
          fileSize: 10485761,
        },
        { admin },
      ),
    ).rejects.toThrow();
    expect(createSignedUploadUrl).not.toHaveBeenCalled();
  });
});

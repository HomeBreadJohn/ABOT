import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "@/lib/http/app-error";
import { createDocumentSignedUrl } from "@/features/documents/services/create-signed-url";

const requireUser = vi.fn();
const createSignedUrl = vi.fn();

vi.mock("@/lib/auth/require-user", () => ({
  requireUser: (...args: unknown[]) => requireUser(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    storage: { from: () => ({ createSignedUrl }) },
  }),
}));

// The service no longer uses the server client directly, but keep the module
// mocked so importing the service never touches next/headers.
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

const DOC_ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

function mockSupabase(
  document: Record<string, unknown> | null,
  share: Record<string, unknown> | null,
) {
  const chain = (result: unknown) => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: result, error: null }),
  });
  const chains: Record<string, unknown> = {
    documents: chain(document),
    document_shares: chain(share),
  };
  return {
    from: vi.fn((table: string) => chains[table]),
  };
}

describe("createDocumentSignedUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a signed URL and TTL for the owner", async () => {
    const supabase = mockSupabase(
      { id: DOC_ID, user_id: "u-1", storage_path: "u-1/x/bill.pdf" },
      null,
    );
    requireUser.mockResolvedValue({ userId: "u-1", supabase });
    createSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://signed.example" },
      error: null,
    });

    const result = await createDocumentSignedUrl(DOC_ID);

    expect(result).toEqual({ signedUrl: "https://signed.example", expiresIn: 60 });
    expect(createSignedUrl).toHaveBeenCalledWith("u-1/x/bill.pdf", 60);
  });

  it("throws AppError NOT_FOUND with no distinguishing message when the document is missing", async () => {
    const supabase = mockSupabase(null, null);
    requireUser.mockResolvedValue({ userId: "u-1", supabase });

    await expect(createDocumentSignedUrl(DOC_ID)).rejects.toMatchObject({
      name: "AppError",
      code: "NOT_FOUND",
    });
  });

  it("throws the same NOT_FOUND error (not distinguishable) when the document exists but is not shared", async () => {
    const supabase = mockSupabase(
      { id: DOC_ID, user_id: "u-other", storage_path: "u-other/x/bill.pdf" },
      null,
    );
    requireUser.mockResolvedValue({ userId: "u-1", supabase });

    const error = await createDocumentSignedUrl(DOC_ID).catch((e) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe("NOT_FOUND");

    const missing = await createDocumentSignedUrl(DOC_ID).catch((e) => e);
    expect(missing.message).toBe(error.message);
  });
});

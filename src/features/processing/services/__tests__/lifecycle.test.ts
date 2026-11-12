import { describe, expect, it, vi } from "vitest";

import { AppError } from "@/lib/http/app-error";
import { transitionDocument } from "@/features/processing/services/lifecycle";

const DOC_ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

/**
 * Fake admin client modelling the Supabase query builder for a
 * compare-and-set update: update(...).eq("id").eq("processing_status")
 * resolves to { count, error }.
 */
function fakeAdmin(result: { count: number | null; error: unknown }) {
  const eq = vi.fn().mockReturnThis();
  const thenable = {
    eq,
    then: (resolve: (value: unknown) => void) => resolve(result),
  };
  const update = vi.fn(() => thenable);
  const from = vi.fn(() => ({ update }));
  return {
    admin: { from } as never,
    from,
    update,
    eq,
  };
}

describe("transitionDocument", () => {
  it("issues a compare-and-set update filtered by id and from status", async () => {
    const { admin, from, update, eq } = fakeAdmin({ count: 1, error: null });

    await transitionDocument(admin, DOC_ID, "AWAITING_UPLOAD", "UPLOADED");

    expect(from).toHaveBeenCalledWith("documents");
    expect(update).toHaveBeenCalledWith(
      { processing_status: "UPLOADED" },
      { count: "exact" },
    );
    expect(eq).toHaveBeenCalledWith("id", DOC_ID);
    expect(eq).toHaveBeenCalledWith("processing_status", "AWAITING_UPLOAD");
  });

  it("throws CONFLICT when zero rows are updated", async () => {
    const { admin } = fakeAdmin({ count: 0, error: null });

    const error = await transitionDocument(
      admin,
      DOC_ID,
      "AWAITING_UPLOAD",
      "UPLOADED",
    ).catch((e) => e);

    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe("CONFLICT");
  });

  it("throws CONFLICT before any query for a disallowed transition", async () => {
    const { admin, from } = fakeAdmin({ count: 1, error: null });

    const error = await transitionDocument(
      admin,
      DOC_ID,
      "ANALYSIS_FAILED",
      "COMPLETED",
    ).catch((e) => e);

    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe("CONFLICT");
    expect(from).not.toHaveBeenCalled();
  });
});

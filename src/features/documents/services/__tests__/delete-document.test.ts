import { describe, expect, it, vi } from "vitest";

import { deleteDocumentResponseSchema } from "@/contracts";
import { AppError } from "@/lib/http/app-error";
import { deleteDocument } from "@/features/documents/services/delete-document";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_ID = "22222222-2222-2222-2222-222222222222";
const DOC_ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const STORAGE_PATH = `${USER_ID}/${DOC_ID}/bill.pdf`;

describe("deleteDocument", () => {
  it("removes the Storage object and the row and returns the Lumen note", async () => {
    const removed: string[][] = [];
    const deletedRows: string[] = [];
    const deps = {
      loadOwned: vi.fn(async () => ({ storage_path: STORAGE_PATH })),
      removeObject: vi.fn(async (paths: string[]) => {
        removed.push(paths);
      }),
      deleteRow: vi.fn(async (id: string) => {
        deletedRows.push(id);
      }),
    };

    const result = await deleteDocument(USER_ID, DOC_ID, deps);

    expect(deleteDocumentResponseSchema.parse(result)).toEqual(result);
    expect(result.documentId).toBe(DOC_ID);
    expect(result.note.toLowerCase()).toContain("lumen");
    expect(removed).toEqual([[STORAGE_PATH]]);
    expect(deletedRows).toEqual([DOC_ID]);
  });

  it("returns NOT_FOUND for a non-owner (recipient)", async () => {
    const deps = {
      // loadOwned uses an owner-scoped query, so a recipient sees nothing.
      loadOwned: vi.fn(async () => null),
      removeObject: vi.fn(),
      deleteRow: vi.fn(),
    };

    const err = await deleteDocument(OTHER_ID, DOC_ID, deps).catch((e) => e);

    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe("NOT_FOUND");
    expect(deps.removeObject).not.toHaveBeenCalled();
    expect(deps.deleteRow).not.toHaveBeenCalled();
  });
});

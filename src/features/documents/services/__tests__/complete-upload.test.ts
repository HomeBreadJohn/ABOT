import { describe, expect, it, vi } from "vitest";

import { AppError } from "@/lib/http/app-error";
import { completeUpload } from "@/features/documents/services/complete-upload";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_ID = "22222222-2222-2222-2222-222222222222";
const DOC_ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const ORIGIN = "https://app.test";

const PDF_HEADER = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d]);
const PNG_HEADER = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);

type DocRow = {
  id: string;
  user_id: string;
  storage_path: string;
  processing_status: string;
  mime_type: string;
  file_size: number;
};

/** User-scoped client (RLS): returns null for another user's row. */
function fakeUser(doc: DocRow | null) {
  const maybeSingle = vi.fn(async () => ({ data: doc, error: null }));
  const user = {
    from: vi.fn(() => ({
      select: () => ({ eq: () => ({ maybeSingle }) }),
    })),
  } as never;
  return user;
}

/** Admin client: compare-and-set update (transitionDocument) plus delete. */
function fakeAdmin(doc: DocRow) {
  const state = { status: doc.processing_status };
  const removed: string[][] = [];
  const deletedRows: string[] = [];

  const update = vi.fn((patch: { processing_status: string }) => {
    const chain = {
      _from: "",
      _to: patch.processing_status,
      eq(column: string, value: string) {
        if (column === "processing_status") this._from = value;
        return this;
      },
      then(resolve: (r: { count: number; error: null }) => void) {
        const matched = state.status === this._from;
        if (matched) state.status = this._to;
        resolve({ count: matched ? 1 : 0, error: null });
      },
    };
    return chain;
  });

  const del = {
    eq: vi.fn(function (this: unknown, _c: string, v: string) {
      deletedRows.push(v);
      return Promise.resolve({ error: null });
    }),
  };

  const remove = vi.fn(async (paths: string[]) => {
    removed.push(paths);
    return { data: null, error: null };
  });

  const admin = {
    from: vi.fn(() => ({ update, delete: () => del })),
    storage: { from: vi.fn(() => ({ remove })) },
  } as never;

  return { admin, state, removed, deletedRows };
}

function doc(overrides: Partial<DocRow> = {}): DocRow {
  return {
    id: DOC_ID,
    user_id: USER_ID,
    storage_path: `${USER_ID}/${DOC_ID}/bill.pdf`,
    processing_status: "AWAITING_UPLOAD",
    mime_type: "application/pdf",
    file_size: 5,
    ...overrides,
  };
}

function deps(
  row: DocRow,
  header: { size: number; firstBytes: Uint8Array },
) {
  const enqueue = vi.fn(async () => ({ jobId: "job-1", created: true }));
  const kick = vi.fn();
  const admin = fakeAdmin(row);
  return {
    enqueue,
    kick,
    ...admin,
    options: {
      user: fakeUser(row),
      admin: admin.admin,
      readHeader: vi.fn(async () => header),
      enqueue,
      kick,
    },
  };
}

describe("completeUpload", () => {
  it("transitions to UPLOADED, enqueues OCR_SUBMIT, and kicks the runner", async () => {
    const row = doc();
    const d = deps(row, { size: 5, firstBytes: PDF_HEADER });

    const summary = await completeUpload(USER_ID, DOC_ID, ORIGIN, d.options);

    expect(summary).toEqual({ documentId: DOC_ID, lifecycle: "UPLOADED" });
    expect(d.state.status).toBe("UPLOADED");
    expect(d.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: DOC_ID,
        userId: USER_ID,
        type: "OCR_SUBMIT",
        idempotencyKey: `ocr-submit:${DOC_ID}`,
      }),
    );
    expect(d.kick).toHaveBeenCalledWith(ORIGIN);
  });

  it("raises INVALID_REQUEST on a size mismatch", async () => {
    const row = doc({ file_size: 5 });
    const d = deps(row, { size: 9, firstBytes: PDF_HEADER });

    const error = await completeUpload(
      USER_ID,
      DOC_ID,
      ORIGIN,
      d.options,
    ).catch((e) => e);

    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe("INVALID_REQUEST");
    expect(d.enqueue).not.toHaveBeenCalled();
  });

  it("raises UNSUPPORTED_FILE and deletes the object and row on a magic-byte mismatch", async () => {
    const row = doc({ mime_type: "application/pdf", file_size: 4 });
    const d = deps(row, { size: 4, firstBytes: PNG_HEADER });

    const error = await completeUpload(
      USER_ID,
      DOC_ID,
      ORIGIN,
      d.options,
    ).catch((e) => e);

    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe("UNSUPPORTED_FILE");
    expect(d.removed).toEqual([[row.storage_path]]);
    expect(d.deletedRows).toContain(DOC_ID);
    expect(d.enqueue).not.toHaveBeenCalled();
  });

  it("is idempotent: a second call returns the summary without re-enqueuing", async () => {
    const row = doc({ processing_status: "OCR_PROCESSING" });
    const d = deps(row, { size: 5, firstBytes: PDF_HEADER });

    const summary = await completeUpload(USER_ID, DOC_ID, ORIGIN, d.options);

    expect(summary).toEqual({
      documentId: DOC_ID,
      lifecycle: "OCR_PROCESSING",
    });
    expect(d.enqueue).not.toHaveBeenCalled();
    expect(d.kick).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND for another user's document", async () => {
    // RLS hides the row entirely, so the user client sees null.
    const d = deps(doc({ user_id: OTHER_ID }), {
      size: 5,
      firstBytes: PDF_HEADER,
    });
    const options = { ...d.options, user: fakeUser(null) };

    const error = await completeUpload(USER_ID, DOC_ID, ORIGIN, options).catch(
      (e) => e,
    );

    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe("NOT_FOUND");
  });
});

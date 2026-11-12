import { describe, expect, it } from "vitest";

import type { NormalizedPage } from "@/lib/providers/ocr-provider";
import { persistPages } from "@/features/ocr/services/persist-pages";

type UpsertRow = {
  document_id: string;
  user_id: string;
  page_number: number;
  extracted_text: string;
  ocr_status: "READY" | "FAILED";
  average_confidence: number | null;
  page_metadata: unknown;
};

function fakeAdmin() {
  const calls: { rows: UpsertRow[]; onConflict?: string }[] = [];
  const admin = {
    from(table: string) {
      expect(table).toBe("document_pages");
      return {
        upsert(rows: UpsertRow[], opts?: { onConflict?: string }) {
          calls.push({ rows, onConflict: opts?.onConflict });
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  return { admin, calls };
}

const pages: NormalizedPage[] = [
  {
    pageNumber: 1,
    status: "READY",
    text: "hello world",
    words: [
      { index: 0, text: "hello", confidence: 0.9 },
      { index: 1, text: "world", confidence: 0.8 },
    ],
    averageConfidence: 0.85,
  },
  {
    pageNumber: 2,
    status: "FAILED",
    text: "",
    words: [],
    averageConfidence: null,
  },
];

describe("persistPages", () => {
  it("upserts one row per page on (document_id, page_number)", async () => {
    const { admin, calls } = fakeAdmin();

    await persistPages(admin as never, "doc-1", "user-1", pages);

    expect(calls).toHaveLength(1);
    expect(calls[0].onConflict).toBe("document_id,page_number");
    expect(calls[0].rows).toHaveLength(2);
    expect(calls[0].rows[0]).toMatchObject({
      document_id: "doc-1",
      user_id: "user-1",
      page_number: 1,
      extracted_text: "hello world",
      ocr_status: "READY",
      average_confidence: 0.85,
    });
    expect(calls[0].rows[1]).toMatchObject({
      page_number: 2,
      ocr_status: "FAILED",
      average_confidence: null,
    });
  });

  it("stores the word list in page_metadata, never a bare column", async () => {
    const { admin, calls } = fakeAdmin();

    await persistPages(admin as never, "doc-1", "user-1", pages);

    expect(calls[0].rows[0].page_metadata).toEqual({
      words: pages[0].words,
    });
  });
});

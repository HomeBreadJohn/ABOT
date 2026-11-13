import { describe, expect, it } from "vitest";

import {
  fetchRecentDocuments,
  RECENT_DOCUMENTS_LIMIT,
  type RecentDocumentsDeps,
} from "@/features/documents/recent-documents";

function listOf(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    documentId: `00000000-0000-4000-8000-00000000000${index}`,
    title: `Document ${index}`,
  }));
}

describe("fetchRecentDocuments", () => {
  it("passes the session user's id to listDocuments and keeps the first five", async () => {
    const seen: string[] = [];
    const deps: RecentDocumentsDeps = {
      requireUser: async () => ({ userId: "user-1" }),
      listDocuments: async (userId) => {
        seen.push(userId);
        return { documents: listOf(8) };
      },
    };

    const result = await fetchRecentDocuments(deps);

    expect(seen).toEqual(["user-1"]);
    expect(RECENT_DOCUMENTS_LIMIT).toBe(5);
    expect(result).toEqual({
      status: "ok",
      documents: listOf(5).map((d) => ({ id: d.documentId, title: d.title })),
    });
  });

  it("returns every document when there are fewer than five", async () => {
    const result = await fetchRecentDocuments({
      requireUser: async () => ({ userId: "user-1" }),
      listDocuments: async () => ({ documents: listOf(2) }),
    });

    expect(result.status === "ok" && result.documents).toHaveLength(2);
  });

  it("returns an empty ok result for a user with no documents", async () => {
    const result = await fetchRecentDocuments({
      requireUser: async () => ({ userId: "user-1" }),
      listDocuments: async () => ({ documents: [] }),
    });

    expect(result).toEqual({ status: "ok", documents: [] });
  });

  it("becomes unavailable, without leaking the error, when listing fails", async () => {
    const result = await fetchRecentDocuments({
      requireUser: async () => ({ userId: "user-1" }),
      listDocuments: async () => {
        throw new Error("connection string postgres://secret");
      },
    });

    expect(result).toEqual({ status: "unavailable" });
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("becomes unavailable when there is no session", async () => {
    const result = await fetchRecentDocuments({
      requireUser: async () => {
        throw new Error("UNAUTHENTICATED");
      },
      listDocuments: async () => ({ documents: listOf(1) }),
    });

    expect(result).toEqual({ status: "unavailable" });
  });
});

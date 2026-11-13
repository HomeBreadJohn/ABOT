import { describe, expect, it } from "vitest";

import { createShareDeps } from "@/features/sharing/services/share-deps";
import { AppError } from "@/lib/http/app-error";

type Call = [method: string, ...args: unknown[]];
type Result = { data?: unknown; error?: { code: string } | null };

/**
 * Minimal Supabase query-builder fake: records every chained call and resolves
 * to `result` when awaited (or via maybeSingle). Verifies the filters the real
 * client is asked to apply, since those carry the owner-only guarantees.
 */
function fakeClient(result: Result) {
  const calls: Call[] = [];
  const builder: Record<string, unknown> = {};
  for (const method of [
    "select",
    "insert",
    "delete",
    "eq",
    "order",
    "maybeSingle",
  ]) {
    builder[method] = (...args: unknown[]) => {
      calls.push([method, ...args]);
      return builder;
    };
  }
  builder.then = (resolve: (value: Result) => unknown) =>
    resolve({ data: null, error: null, ...result });

  const tables: string[] = [];
  const client = {
    from: (table: string) => {
      tables.push(table);
      return builder;
    },
  };
  return { client: client as never, calls, tables };
}

const USER = crypto.randomUUID();
const DOC = crypto.randomUUID();
const SHARE = crypto.randomUUID();
const RECIPIENT = crypto.randomUUID();

describe("createShareDeps", () => {
  it("ownsDocument filters on user_id, not just the document id", async () => {
    const { client, calls, tables } = fakeClient({ data: { id: DOC } });
    expect(await createShareDeps(client).ownsDocument(USER, DOC)).toBe(true);
    expect(tables).toEqual(["documents"]);
    expect(calls).toContainEqual(["eq", "id", DOC]);
    expect(calls).toContainEqual(["eq", "user_id", USER]);
  });

  it("ownsDocument is false when no row is visible", async () => {
    const { client } = fakeClient({ data: null });
    expect(await createShareDeps(client).ownsDocument(USER, DOC)).toBe(false);
  });

  it("listShares scopes by document and owner", async () => {
    const { client, calls } = fakeClient({
      data: [
        {
          id: SHARE,
          document_id: DOC,
          permission: "viewer",
          created_at: "2026-11-20T08:00:00+00:00",
        },
      ],
    });
    const rows = await createShareDeps(client).listShares(USER, DOC);
    expect(rows).toHaveLength(1);
    expect(calls).toContainEqual(["eq", "document_id", DOC]);
    expect(calls).toContainEqual(["eq", "owner_id", USER]);
  });

  it("insertShare writes the session owner and maps a unique violation to DUPLICATE", async () => {
    const created = fakeClient({ error: null });
    expect(
      await createShareDeps(created.client).insertShare({
        documentId: DOC,
        ownerId: USER,
        sharedWithUserId: RECIPIENT,
        permission: "viewer",
      }),
    ).toBe("CREATED");
    expect(created.calls[0]).toEqual([
      "insert",
      {
        document_id: DOC,
        owner_id: USER,
        shared_with_user_id: RECIPIENT,
        permission: "viewer",
      },
    ]);

    const duplicate = fakeClient({ error: { code: "23505" } });
    expect(
      await createShareDeps(duplicate.client).insertShare({
        documentId: DOC,
        ownerId: USER,
        sharedWithUserId: RECIPIENT,
        permission: "viewer",
      }),
    ).toBe("DUPLICATE");
  });

  it("insertShare maps an RLS denial to NOT_FOUND", async () => {
    const { client } = fakeClient({ error: { code: "42501" } });
    const error = await createShareDeps(client)
      .insertShare({
        documentId: DOC,
        ownerId: USER,
        sharedWithUserId: RECIPIENT,
        permission: "viewer",
      })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe("NOT_FOUND");
  });

  it("deleteShare scopes by share, document and owner and reports whether a row went", async () => {
    const hit = fakeClient({ data: [{ id: SHARE }] });
    expect(
      await createShareDeps(hit.client).deleteShare(USER, DOC, SHARE),
    ).toBe(true);
    expect(hit.calls).toContainEqual(["eq", "id", SHARE]);
    expect(hit.calls).toContainEqual(["eq", "document_id", DOC]);
    expect(hit.calls).toContainEqual(["eq", "owner_id", USER]);

    const miss = fakeClient({ data: [] });
    expect(
      await createShareDeps(miss.client).deleteShare(USER, DOC, SHARE),
    ).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import {
  deleteReminderResponseSchema,
  reminderListResponseSchema,
  reminderSchema,
} from "@/contracts";
import {
  createReminder,
  deleteReminder,
  listReminders,
  updateReminder,
  type ReminderDeps,
} from "@/features/reminders/services/reminder-service";
import type { ReminderRow } from "@/features/reminders/types";
import { AppError } from "@/lib/http/app-error";

const ALICE = "11111111-1111-4111-8111-111111111111";
const BOB = "22222222-2222-4222-8222-222222222222";
const ALICE_DOC = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const BOB_DOC = "4f2504e0-4f89-41d3-9a0c-0305e82c3302";
const ID_1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const ID_2 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const ID_3 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";

type StoredRow = ReminderRow & { user_id: string };

/** In-memory fake that mimics the owner-scoped data access. */
function fakeDeps(
  initial: StoredRow[] = [],
  visibleDocs: Record<string, string[]> = {},
) {
  const rows = [...initial];
  let nextId = 100;
  const deps: ReminderDeps = {
    async listRows(userId) {
      return rows.filter((r) => r.user_id === userId);
    },
    async getRow(userId, id) {
      return rows.find((r) => r.id === id && r.user_id === userId) ?? null;
    },
    async documentVisible(userId, documentId) {
      return (visibleDocs[userId] ?? []).includes(documentId);
    },
    async insertRow(userId, insert) {
      const stored: StoredRow = {
        id: `bbbbbbbb-bbbb-4bbb-8bbb-${String(nextId++).padStart(12, "0")}`,
        reminder_at: null,
        ...insert,
      };
      rows.push(stored);
      return stored;
    },
    async updateRow(userId, id, patch) {
      const found = rows.find((r) => r.id === id && r.user_id === userId);
      if (!found) return null;
      Object.assign(found, patch);
      return found;
    },
    async deleteRow(userId, id) {
      const index = rows.findIndex((r) => r.id === id && r.user_id === userId);
      if (index === -1) return false;
      rows.splice(index, 1);
      return true;
    },
  };
  return { deps, rows };
}

function stored(overrides: Partial<StoredRow>): StoredRow {
  return {
    id: ID_1,
    user_id: ALICE,
    document_id: null,
    title: "Pay bill",
    description: null,
    due_at: "2026-12-01T00:00:00Z",
    reminder_at: null,
    status: "PENDING",
    ...overrides,
  };
}

async function codeOf(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AppError);
  return (error as AppError).code;
}

describe("listReminders", () => {
  it("returns only the caller's reminders, due date ascending, skipping null-due rows", async () => {
    const { deps } = fakeDeps([
      stored({ id: ID_3, due_at: "2026-12-03T00:00:00Z" }),
      stored({ id: ID_2, due_at: null }),
      stored({ id: ID_1, due_at: "2026-12-01T00:00:00Z" }),
      stored({ id: "other", user_id: BOB, due_at: "2026-11-01T00:00:00Z" }),
    ]);

    const result = await listReminders(ALICE, deps);

    expect(reminderListResponseSchema.safeParse(result).success).toBe(true);
    expect(result.reminders.map((r) => r.id)).toEqual([ID_1, ID_3]);
  });
});

describe("createReminder", () => {
  it("creates an ACTIVE reminder owned by the session user", async () => {
    const { deps, rows } = fakeDeps();

    const created = await createReminder(
      ALICE,
      { title: "Renew", dueAt: "2026-12-05T10:00:00Z", notes: "n" },
      deps,
    );

    expect(reminderSchema.safeParse(created).success).toBe(true);
    expect(created).toMatchObject({
      title: "Renew",
      status: "ACTIVE",
      notes: "n",
      documentId: null,
    });
    expect(rows[0]).toMatchObject({
      user_id: ALICE,
      status: "PENDING",
      description: "n",
      reminder_at: null,
    });
  });

  it("links a document the user can see", async () => {
    const { deps } = fakeDeps([], { [ALICE]: [ALICE_DOC] });
    const created = await createReminder(
      ALICE,
      { title: "x", dueAt: "2026-12-05T10:00:00Z", documentId: ALICE_DOC },
      deps,
    );
    expect(created.documentId).toBe(ALICE_DOC);
  });

  it("returns NOT_FOUND for a document the user cannot see and writes nothing", async () => {
    const { deps, rows } = fakeDeps([], { [BOB]: [BOB_DOC] });
    const code = await codeOf(
      createReminder(
        ALICE,
        { title: "x", dueAt: "2026-12-05T10:00:00Z", documentId: BOB_DOC },
        deps,
      ),
    );
    expect(code).toBe("NOT_FOUND");
    expect(rows).toHaveLength(0);
  });

  it("returns NOT_FOUND for a malformed document id without querying", async () => {
    const { deps } = fakeDeps();
    deps.documentVisible = () => {
      throw new Error("should not be called");
    };
    const code = await codeOf(
      createReminder(
        ALICE,
        { title: "x", dueAt: "2026-12-05T10:00:00Z", documentId: "nope" },
        deps,
      ),
    );
    expect(code).toBe("NOT_FOUND");
  });
});

describe("updateReminder", () => {
  it("updates status, notes, title and due date", async () => {
    const { deps, rows } = fakeDeps([stored({})]);

    const updated = await updateReminder(
      ALICE,
      ID_1,
      {
        status: "DONE",
        notes: "paid",
        title: "Paid bill",
        dueAt: "2026-12-09T00:00:00Z",
      },
      deps,
    );

    expect(updated).toMatchObject({
      status: "DONE",
      notes: "paid",
      title: "Paid bill",
      dueAt: "2026-12-09T00:00:00.000Z",
    });
    expect(rows[0].status).toBe("SENT");
    expect(rows[0].reminder_at).toBeNull();
  });

  it("returns the current reminder for an empty update", async () => {
    const { deps } = fakeDeps([stored({})]);
    const result = await updateReminder(ALICE, ID_1, {}, deps);
    expect(result.id).toBe(ID_1);
  });

  it("returns NOT_FOUND for another user's reminder and leaves it unchanged", async () => {
    const { deps, rows } = fakeDeps([stored({ user_id: BOB })]);
    const code = await codeOf(
      updateReminder(ALICE, ID_1, { status: "DISMISSED" }, deps),
    );
    expect(code).toBe("NOT_FOUND");
    expect(rows[0].status).toBe("PENDING");
  });

  it("returns NOT_FOUND for a missing or malformed id", async () => {
    const { deps } = fakeDeps();
    expect(await codeOf(updateReminder(ALICE, ID_2, {}, deps))).toBe(
      "NOT_FOUND",
    );
    expect(await codeOf(updateReminder(ALICE, "nope", {}, deps))).toBe(
      "NOT_FOUND",
    );
  });

  it("treats a null-due row as NOT_FOUND unless the update sets a due date", async () => {
    const { deps, rows } = fakeDeps([stored({ due_at: null })]);

    expect(
      await codeOf(updateReminder(ALICE, ID_1, { title: "t" }, deps)),
    ).toBe("NOT_FOUND");
    expect(rows[0].title).toBe("Pay bill");

    const fixed = await updateReminder(
      ALICE,
      ID_1,
      { dueAt: "2026-12-09T00:00:00Z" },
      deps,
    );
    expect(fixed.dueAt).toBe("2026-12-09T00:00:00.000Z");
  });
});

describe("deleteReminder", () => {
  it("deletes the caller's reminder and returns its id", async () => {
    const { deps, rows } = fakeDeps([stored({})]);
    const result = await deleteReminder(ALICE, ID_1, deps);
    expect(deleteReminderResponseSchema.parse(result)).toEqual({
      reminderId: ID_1,
    });
    expect(rows).toHaveLength(0);
  });

  it("returns NOT_FOUND for another user's reminder and keeps it", async () => {
    const { deps, rows } = fakeDeps([stored({ user_id: BOB })]);
    expect(await codeOf(deleteReminder(ALICE, ID_1, deps))).toBe("NOT_FOUND");
    expect(rows).toHaveLength(1);
  });

  it("returns NOT_FOUND for a malformed id", async () => {
    const { deps } = fakeDeps();
    expect(await codeOf(deleteReminder(ALICE, "nope", deps))).toBe("NOT_FOUND");
  });
});

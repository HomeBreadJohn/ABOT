import { describe, expect, it } from "vitest";

import {
  createReminderRequestSchema,
  reminderSchema,
  updateReminderRequestSchema,
} from "@/contracts";
import {
  createInputToInsert,
  rowToReminder,
  rowsToReminders,
  statusFromDb,
  statusToDb,
  updateInputToPatch,
} from "@/features/reminders/mapping";
import type {
  ReminderDbStatus,
  ReminderRow,
  ReminderStatus,
} from "@/features/reminders/types";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const DOC_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

function row(overrides: Partial<ReminderRow> = {}): ReminderRow {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    document_id: null,
    title: "Pay bill",
    description: null,
    due_at: "2026-12-01T00:00:00Z",
    reminder_at: null,
    status: "PENDING",
    ...overrides,
  };
}

describe("status mapping", () => {
  const pairs: [ReminderStatus, ReminderDbStatus][] = [
    ["ACTIVE", "PENDING"],
    ["DONE", "SENT"],
    ["DISMISSED", "DISMISSED"],
  ];

  it.each(pairs)("maps %s <-> %s", (contract, db) => {
    expect(statusToDb(contract)).toBe(db);
    expect(statusFromDb(db)).toBe(contract);
  });

  it("is total and round-trips over every status in both directions", () => {
    for (const status of reminderSchema.shape.status.options) {
      expect(statusFromDb(statusToDb(status))).toBe(status);
    }
    for (const [, db] of pairs) {
      expect(statusToDb(statusFromDb(db))).toBe(db);
    }
  });
});

describe("rowToReminder", () => {
  it("maps description to notes and validates against the contract", () => {
    const reminder = rowToReminder(
      row({ description: "bring ID", document_id: DOC_ID, status: "SENT" }),
    );
    expect(reminder).toEqual({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      documentId: DOC_ID,
      title: "Pay bill",
      dueAt: "2026-12-01T00:00:00.000Z",
      status: "DONE",
      notes: "bring ID",
    });
    expect(reminderSchema.safeParse(reminder).success).toBe(true);
  });

  it("normalizes a Postgres +00:00 timestamp to Z form", () => {
    const reminder = rowToReminder(
      row({ due_at: "2026-12-01T08:30:00+00:00" }),
    );
    expect(reminder?.dueAt).toBe("2026-12-01T08:30:00.000Z");
  });

  it("ignores reminder_at", () => {
    const reminder = rowToReminder(
      row({ reminder_at: "2026-11-30T00:00:00Z" }),
    );
    expect(reminder).not.toHaveProperty("reminderAt");
    expect(reminder?.dueAt).toBe("2026-12-01T00:00:00.000Z");
  });

  it("returns null for a null or unparseable due_at instead of inventing a date", () => {
    expect(rowToReminder(row({ due_at: null }))).toBeNull();
    expect(rowToReminder(row({ due_at: "not a date" }))).toBeNull();
  });
});

describe("rowsToReminders", () => {
  it("skips null-due rows and orders by due date ascending", () => {
    const result = rowsToReminders([
      row({ id: "c", due_at: "2026-12-03T00:00:00Z" }),
      row({ id: "n", due_at: null }),
      row({ id: "a", due_at: "2026-12-01T00:00:00Z" }),
      row({ id: "b", due_at: "2026-12-02T00:00:00Z" }),
    ]);
    expect(result.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });
});

describe("request -> row mapping", () => {
  it("builds an insert with the session owner, PENDING and no reminder_at", () => {
    const insert = createInputToInsert(USER_ID, {
      title: "Pay bill",
      dueAt: "2026-12-01T00:00:00Z",
      documentId: DOC_ID,
      notes: "n",
    });
    expect(insert).toEqual({
      user_id: USER_ID,
      document_id: DOC_ID,
      title: "Pay bill",
      description: "n",
      due_at: "2026-12-01T00:00:00Z",
      status: "PENDING",
    });
    expect(insert).not.toHaveProperty("reminder_at");
  });

  it("defaults optional create fields to null", () => {
    const insert = createInputToInsert(USER_ID, {
      title: "x",
      dueAt: "2026-12-01T00:00:00Z",
    });
    expect(insert.document_id).toBeNull();
    expect(insert.description).toBeNull();
  });

  it("builds a patch containing only supplied keys", () => {
    expect(updateInputToPatch({})).toEqual({});
    expect(updateInputToPatch({ status: "DONE", notes: "n" })).toEqual({
      status: "SENT",
      description: "n",
    });
    expect(
      updateInputToPatch({ title: "t", dueAt: "2026-12-01T00:00:00Z" }),
    ).toEqual({ title: "t", due_at: "2026-12-01T00:00:00Z" });
  });
});

describe("strict request schemas", () => {
  const valid = { title: "Pay bill", dueAt: "2026-12-01T00:00:00Z" };

  it.each(["userId", "user_id", "ownerId", "extra"])(
    "rejects an unknown or owner key (%s) on create and update",
    (key) => {
      expect(
        createReminderRequestSchema.safeParse({ ...valid, [key]: "x" }).success,
      ).toBe(false);
      expect(
        updateReminderRequestSchema.safeParse({ title: "t", [key]: "x" })
          .success,
      ).toBe(false);
    },
  );

  it("rejects invalid dates and empty titles", () => {
    expect(
      createReminderRequestSchema.safeParse({ ...valid, dueAt: "2026-12-01" })
        .success,
    ).toBe(false);
    expect(
      createReminderRequestSchema.safeParse({ ...valid, dueAt: "tomorrow" })
        .success,
    ).toBe(false);
    expect(
      createReminderRequestSchema.safeParse({ ...valid, title: "  " }).success,
    ).toBe(false);
    expect(
      updateReminderRequestSchema.safeParse({ dueAt: "nope" }).success,
    ).toBe(false);
    expect(
      updateReminderRequestSchema.safeParse({ status: "PENDING" }).success,
    ).toBe(false);
  });
});

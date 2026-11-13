import {
  deleteReminderResponseSchema,
  reminderListResponseSchema,
  reminderSchema,
} from "@/contracts";
import {
  createInputToInsert,
  rowToReminder,
  rowsToReminders,
  updateInputToPatch,
} from "@/features/reminders/mapping";
import type {
  CreateReminderInput,
  Reminder,
  ReminderInsert,
  ReminderPatch,
  ReminderRow,
  UpdateReminderInput,
} from "@/features/reminders/types";
import { AppError } from "@/lib/http/app-error";

/**
 * Data-access seam. Production wiring (user/RLS client) is in
 * supabase-deps.ts; unit tests pass in-memory fakes. Every method is scoped to
 * `userId`, so another user's reminder is indistinguishable from a missing one.
 */
export type ReminderDeps = {
  /** The user's reminders, due date ascending (nulls last). */
  listRows: (userId: string) => Promise<ReminderRow[]>;
  getRow: (userId: string, reminderId: string) => Promise<ReminderRow | null>;
  /** Whether the document exists and is visible to the user (owner or share recipient). */
  documentVisible: (userId: string, documentId: string) => Promise<boolean>;
  insertRow: (userId: string, insert: ReminderInsert) => Promise<ReminderRow>;
  /** Null when the row is missing or not the user's. */
  updateRow: (
    userId: string,
    reminderId: string,
    patch: ReminderPatch,
  ) => Promise<ReminderRow | null>;
  /** False when nothing was deleted (missing or not the user's). */
  deleteRow: (userId: string, reminderId: string) => Promise<boolean>;
};

// Ids are uuid columns. A malformed id is reported as NOT_FOUND here so
// Postgres never sees it and no raw DB error can reach the response.
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireUuid(id: string): void {
  if (!UUID_PATTERN.test(id)) throw new AppError("NOT_FOUND");
}

/**
 * The user's reminders, due date ascending. Rows with a null or invalid due_at
 * are skipped: the contract requires `dueAt`, and we never invent a date.
 */
export async function listReminders(userId: string, deps: ReminderDeps) {
  const rows = await deps.listRows(userId);
  return reminderListResponseSchema.parse({ reminders: rowsToReminders(rows) });
}

/** Create a reminder, optionally linked to a document the user can see. */
export async function createReminder(
  userId: string,
  input: CreateReminderInput,
  deps: ReminderDeps,
): Promise<Reminder> {
  if (input.documentId !== undefined) {
    requireUuid(input.documentId);
    if (!(await deps.documentVisible(userId, input.documentId)))
      throw new AppError("NOT_FOUND");
  }

  const row = await deps.insertRow(userId, createInputToInsert(userId, input));
  return toReminderOrThrow(row);
}

/**
 * Update title, due date, status or notes. Another user's reminder is NOT_FOUND.
 * A row with a null due_at cannot be represented in the response, so it is also
 * NOT_FOUND unless this update supplies a due date.
 */
export async function updateReminder(
  userId: string,
  reminderId: string,
  input: UpdateReminderInput,
  deps: ReminderDeps,
): Promise<Reminder> {
  requireUuid(reminderId);
  const existing = await deps.getRow(userId, reminderId);
  if (!existing) throw new AppError("NOT_FOUND");
  if (existing.due_at === null && input.dueAt === undefined)
    throw new AppError("NOT_FOUND");

  const patch = updateInputToPatch(input);
  if (Object.keys(patch).length === 0) return toReminderOrThrow(existing);

  const updated = await deps.updateRow(userId, reminderId, patch);
  if (!updated) throw new AppError("NOT_FOUND");
  return toReminderOrThrow(updated);
}

/** Delete a reminder. Another user's reminder is NOT_FOUND. */
export async function deleteReminder(
  userId: string,
  reminderId: string,
  deps: ReminderDeps,
) {
  requireUuid(reminderId);
  if (!(await deps.deleteRow(userId, reminderId)))
    throw new AppError("NOT_FOUND");
  return deleteReminderResponseSchema.parse({ reminderId });
}

function toReminderOrThrow(row: ReminderRow): Reminder {
  const reminder = rowToReminder(row);
  // Only reachable if the stored due_at is unusable; never expose the row.
  if (!reminder) throw new AppError("NOT_FOUND");
  return reminderSchema.parse(reminder);
}

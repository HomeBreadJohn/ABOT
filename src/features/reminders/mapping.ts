/**
 * Single place that maps between the reminder API contract and the
 * public.reminders row.
 *
 * Known contract/schema mismatches (open questions for Person 2):
 * - Status: the contract has ACTIVE | DONE | DISMISSED, the table has
 *   PENDING | SENT | DISMISSED. We map ACTIVE<->PENDING, DONE<->SENT,
 *   DISMISSED<->DISMISSED. SENT normally means "a notification was sent", so
 *   reusing it for "the user finished this" is a stand-in. If a notifier ever
 *   writes SENT, those reminders will show up as DONE.
 * - `notes` is stored in `description`.
 * - `reminder_at` has no contract field. Inserts leave it null and updates never
 *   touch it.
 * - `due_at` is nullable in the table but `dueAt` is required in the contract.
 *   Rows with a null (or unparseable) `due_at` cannot be represented, so list
 *   responses SKIP them. No date is ever made up. Single-row reads treat such a
 *   row as not representable too (see the service).
 */
import { reminderSchema } from "@/contracts";
import type {
  CreateReminderInput,
  Reminder,
  ReminderDbStatus,
  ReminderInsert,
  ReminderPatch,
  ReminderRow,
  ReminderStatus,
  UpdateReminderInput,
} from "@/features/reminders/types";

const TO_DB: Record<ReminderStatus, ReminderDbStatus> = {
  ACTIVE: "PENDING",
  DONE: "SENT",
  DISMISSED: "DISMISSED",
};

const FROM_DB: Record<ReminderDbStatus, ReminderStatus> = {
  PENDING: "ACTIVE",
  SENT: "DONE",
  DISMISSED: "DISMISSED",
};

export function statusToDb(status: ReminderStatus): ReminderDbStatus {
  return TO_DB[status];
}

export function statusFromDb(status: ReminderDbStatus): ReminderStatus {
  return FROM_DB[status];
}

/**
 * Row -> contract reminder, or null when the row cannot be represented
 * (null/invalid due_at). Timestamps are normalized to UTC `Z` form because
 * Postgres returns `+00:00`, which the contract's datetime check rejects.
 */
export function rowToReminder(row: ReminderRow): Reminder | null {
  if (row.due_at === null) return null;
  const dueMs = Date.parse(row.due_at);
  if (Number.isNaN(dueMs)) return null;

  return reminderSchema.parse({
    id: row.id,
    documentId: row.document_id,
    title: row.title,
    dueAt: new Date(dueMs).toISOString(),
    status: statusFromDb(row.status),
    notes: row.description,
  });
}

/** Rows -> reminders, skipping rows that cannot be represented, due date ascending. */
export function rowsToReminders(rows: ReminderRow[]): Reminder[] {
  return rows
    .map(rowToReminder)
    .filter((reminder): reminder is Reminder => reminder !== null)
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
}

/** Create request -> insert columns. The owner comes from the session, never the client. */
export function createInputToInsert(
  userId: string,
  input: CreateReminderInput,
): ReminderInsert {
  return {
    user_id: userId,
    document_id: input.documentId ?? null,
    title: input.title,
    description: input.notes ?? null,
    due_at: input.dueAt,
    status: statusToDb("ACTIVE"),
  };
}

/** Update request -> columns to write. Absent keys stay absent. */
export function updateInputToPatch(input: UpdateReminderInput): ReminderPatch {
  const patch: ReminderPatch = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.notes !== undefined) patch.description = input.notes;
  if (input.dueAt !== undefined) patch.due_at = input.dueAt;
  if (input.status !== undefined) patch.status = statusToDb(input.status);
  return patch;
}

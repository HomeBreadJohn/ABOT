import type { z } from "zod";

import type {
  createReminderRequestSchema,
  reminderSchema,
  updateReminderRequestSchema,
} from "@/contracts";

/** Reminder as the API contract exposes it. */
export type Reminder = z.infer<typeof reminderSchema>;
export type ReminderStatus = Reminder["status"];
export type CreateReminderInput = z.infer<typeof createReminderRequestSchema>;
export type UpdateReminderInput = z.infer<typeof updateReminderRequestSchema>;

/** Status values stored in public.reminders.status (check constraint). */
export type ReminderDbStatus = "PENDING" | "SENT" | "DISMISSED";

/** The columns this feature reads from public.reminders. */
export type ReminderRow = {
  id: string;
  document_id: string | null;
  title: string;
  description: string | null;
  /** Nullable in the DB; the contract requires a due date. */
  due_at: string | null;
  /** Nullable in the DB; the contract has no field for it, so it is never set. */
  reminder_at: string | null;
  status: ReminderDbStatus;
};

/** Columns written on insert. `reminder_at` is deliberately absent (stays null). */
export type ReminderInsert = {
  user_id: string;
  document_id: string | null;
  title: string;
  description: string | null;
  due_at: string;
  status: ReminderDbStatus;
};

/** Columns written on update. Only keys the client supplied are present. */
export type ReminderPatch = {
  title?: string;
  description?: string;
  due_at?: string;
  status?: ReminderDbStatus;
};

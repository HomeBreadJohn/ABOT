/** Reminder endpoints. Types derive from the contract schemas. */
import type { z } from "zod";

import {
  createReminderRequestSchema,
  deleteReminderResponseSchema,
  reminderListResponseSchema,
  reminderSchema,
  updateReminderRequestSchema,
} from "@/contracts";
import { apiFetch } from "@/lib/api-client/client";

type Reminder = z.infer<typeof reminderSchema>;
type ReminderListResponse = z.infer<typeof reminderListResponseSchema>;
type CreateReminderRequest = z.infer<typeof createReminderRequestSchema>;
type UpdateReminderRequest = z.infer<typeof updateReminderRequestSchema>;
type DeleteReminderResponse = z.infer<typeof deleteReminderResponseSchema>;

/** GET /api/reminders — the user's reminders, due date ascending. */
export function listReminders(): Promise<ReminderListResponse> {
  return apiFetch("/api/reminders", { schema: reminderListResponseSchema });
}

/** POST /api/reminders — create a reminder, optionally linked to a document. */
export function createReminder(
  input: CreateReminderRequest,
): Promise<Reminder> {
  return apiFetch("/api/reminders", {
    method: "POST",
    body: input,
    schema: reminderSchema,
  });
}

/** PATCH /api/reminders/:id — change title, due date, status or notes. */
export function updateReminder(
  reminderId: string,
  input: UpdateReminderRequest,
): Promise<Reminder> {
  return apiFetch(`/api/reminders/${encodeURIComponent(reminderId)}`, {
    method: "PATCH",
    body: input,
    schema: reminderSchema,
  });
}

/** DELETE /api/reminders/:id — remove a reminder. */
export function deleteReminder(
  reminderId: string,
): Promise<DeleteReminderResponse> {
  return apiFetch(`/api/reminders/${encodeURIComponent(reminderId)}`, {
    method: "DELETE",
    schema: deleteReminderResponseSchema,
  });
}

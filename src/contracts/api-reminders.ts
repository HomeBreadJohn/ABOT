/**
 * Reminder endpoint contracts (Person 1 implements these routes).
 */
import { z } from "zod";

export const reminderSchema = z.object({
  id: z.string().min(1),
  documentId: z.string().min(1).nullable(),
  title: z.string().min(1),
  dueAt: z.iso.datetime(),
  status: z.enum(["ACTIVE", "DONE", "DISMISSED"]),
  notes: z.string().nullable(),
});

/* POST /api/reminders */
export const createReminderRequestSchema = z.strictObject({
  title: z.string().trim().min(1).max(255),
  dueAt: z.iso.datetime(),
  documentId: z.string().min(1).optional(),
  notes: z.string().optional(),
});

/* PATCH /api/reminders/:id */
export const updateReminderRequestSchema = z.strictObject({
  title: z.string().trim().min(1).max(255).optional(),
  dueAt: z.iso.datetime().optional(),
  status: z.enum(["ACTIVE", "DONE", "DISMISSED"]).optional(),
  notes: z.string().optional(),
});

/* GET /api/reminders */
export const reminderListResponseSchema = z.object({
  reminders: z.array(reminderSchema),
});

/* DELETE /api/reminders/:id */
export const deleteReminderRequestSchema = z.strictObject({});
export const deleteReminderResponseSchema = z.object({
  reminderId: z.string().min(1),
});

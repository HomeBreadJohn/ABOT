import {
  deleteReminderRequestSchema,
  updateReminderRequestSchema,
} from "@/contracts";
import { apiOk, withApiErrors } from "@/lib/http/api-response";
import { requireUser } from "@/lib/auth/require-user";

import { readJson } from "@/features/reminders/read-json";
import {
  deleteReminder,
  updateReminder,
} from "@/features/reminders/services/reminder-service";
import { createSupabaseReminderDeps } from "@/features/reminders/services/supabase-deps";

type Ctx = { params: Promise<{ reminderId: string }> };

// Update title, due date, status or notes. Another user's reminder is NOT_FOUND.
export const PATCH = withApiErrors(
  async (request: Request, { params }: Ctx) => {
    const { userId, supabase } = await requireUser();
    const { reminderId } = await params;
    const input = updateReminderRequestSchema.parse(await readJson(request));
    return apiOk(
      await updateReminder(
        userId,
        reminderId,
        input,
        createSupabaseReminderDeps(supabase),
      ),
    );
  },
);

// Delete a reminder. DELETE carries no body; if one is sent it must be `{}`.
export const DELETE = withApiErrors(
  async (request: Request, { params }: Ctx) => {
    const { userId, supabase } = await requireUser();
    const { reminderId } = await params;
    deleteReminderRequestSchema.parse(
      (await readJson(request, { optional: true })) ?? {},
    );
    return apiOk(
      await deleteReminder(
        userId,
        reminderId,
        createSupabaseReminderDeps(supabase),
      ),
    );
  },
);

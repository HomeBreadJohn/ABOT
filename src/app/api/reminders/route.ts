import { createReminderRequestSchema } from "@/contracts";
import { apiOk, withApiErrors } from "@/lib/http/api-response";
import { requireUser } from "@/lib/auth/require-user";

import { readJson } from "@/features/reminders/read-json";
import {
  createReminder,
  listReminders,
} from "@/features/reminders/services/reminder-service";
import { createSupabaseReminderDeps } from "@/features/reminders/services/supabase-deps";

// The user's reminders, due date ascending. Rows without a due date are skipped
// because the contract requires `dueAt`.
export const GET = withApiErrors(async () => {
  const { userId, supabase } = await requireUser();
  return apiOk(
    await listReminders(userId, createSupabaseReminderDeps(supabase)),
  );
});

// The owner is always the session user; the strict schema rejects any owner id
// in the body. A document link requires a document the user can see.
export const POST = withApiErrors(async (request: Request) => {
  const { userId, supabase } = await requireUser();
  const input = createReminderRequestSchema.parse(await readJson(request));
  return apiOk(
    await createReminder(userId, input, createSupabaseReminderDeps(supabase)),
  );
});

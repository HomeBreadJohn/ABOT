import "server-only";

import type { ReminderDeps } from "@/features/reminders/services/reminder-service";
import type { ReminderRow } from "@/features/reminders/types";
import type { createClient } from "@/lib/supabase/server";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

const COLUMNS =
  "id, document_id, title, description, due_at, reminder_at, status";

/**
 * Production deps on the user (RLS) client. RLS already limits reminders to the
 * owner; the explicit `user_id` filter is a second guard. Database errors are
 * thrown as-is: withApiErrors turns them into a generic INTERNAL_ERROR and never
 * returns their text.
 */
export function createSupabaseReminderDeps(
  supabase: ServerClient,
): ReminderDeps {
  return {
    async listRows(userId) {
      const { data, error } = await supabase
        .from("reminders")
        .select(COLUMNS)
        .eq("user_id", userId)
        .order("due_at", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as ReminderRow[];
    },

    async getRow(userId, reminderId) {
      const { data, error } = await supabase
        .from("reminders")
        .select(COLUMNS)
        .eq("id", reminderId)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return (data as ReminderRow | null) ?? null;
    },

    async documentVisible(_userId, documentId) {
      // documents RLS exposes the owner's rows and rows shared with the user.
      const { data, error } = await supabase
        .from("documents")
        .select("id")
        .eq("id", documentId)
        .maybeSingle();
      if (error) throw error;
      return data !== null;
    },

    async insertRow(_userId, insert) {
      const { data, error } = await supabase
        .from("reminders")
        .insert(insert)
        .select(COLUMNS)
        .single();
      if (error) throw error;
      return data as ReminderRow;
    },

    async updateRow(userId, reminderId, patch) {
      const { data, error } = await supabase
        .from("reminders")
        .update(patch)
        .eq("id", reminderId)
        .eq("user_id", userId)
        .select(COLUMNS)
        .maybeSingle();
      if (error) throw error;
      return (data as ReminderRow | null) ?? null;
    },

    async deleteRow(userId, reminderId) {
      const { data, error } = await supabase
        .from("reminders")
        .delete()
        .eq("id", reminderId)
        .eq("user_id", userId)
        .select("id");
      if (error) throw error;
      return (data?.length ?? 0) > 0;
    },
  };
}

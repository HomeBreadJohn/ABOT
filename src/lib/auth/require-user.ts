import { AppError } from "@/lib/http/app-error";
import { createClient } from "@/lib/supabase/server";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Derives the user from the Supabase session. Never trusts client-provided
 * owner IDs; throws UNAUTHENTICATED when there is no session.
 */
export async function requireUser(): Promise<{
  userId: string;
  supabase: ServerClient;
}> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) throw new AppError("UNAUTHENTICATED");
  return { userId, supabase };
}

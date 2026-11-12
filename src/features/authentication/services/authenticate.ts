import { z } from "zod";

import { createClient } from "@/lib/supabase/client";

const credentialsSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export type Credentials = z.infer<typeof credentialsSchema>;

export async function signIn(credentials: Credentials) {
  const values = credentialsSchema.parse(credentials);
  const { error } = await createClient().auth.signInWithPassword(values);

  if (error) throw new Error(error.message);
}

export async function register(credentials: Credentials) {
  const values = credentialsSchema.parse(credentials);
  const { error } = await createClient().auth.signUp({
    ...values,
    options: {
      emailRedirectTo: `${window.location.origin}/login`,
    },
  });

  if (error) throw new Error(error.message);
}

export async function signOut() {
  const { error } = await createClient().auth.signOut();
  if (error) throw new Error(error.message);
}

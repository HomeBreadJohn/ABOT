import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getPublicEnv } from "@/lib/env/public";

export async function createClient() {
  const cookieStore = await cookies();
  const env = getPublicEnv();

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Components cannot always write cookies. Middleware refreshes the session.
          }
        },
      },
    },
  );
}

type VerifiedClaims = Record<string, unknown> & {
  sub: string;
  exp?: number;
};

function hasValidClaims(claims: unknown): claims is VerifiedClaims {
  if (!claims || typeof claims !== "object") return false;

  const candidate = claims as Record<string, unknown>;
  if (typeof candidate.sub !== "string" || candidate.sub.length === 0) {
    return false;
  }

  if (candidate.exp === undefined) return true;

  return (
    typeof candidate.exp === "number" &&
    Number.isFinite(candidate.exp) &&
    candidate.exp > Math.floor(Date.now() / 1000)
  );
}

function hasSupabaseAuthCookie(cookieNames: string[]) {
  return cookieNames.some((name) => /^sb-.+-auth-token(?:\.\d+)?$/.test(name));
}

export async function getServerAuthState() {
  const cookieStore = await cookies();
  const hasSessionCookie = hasSupabaseAuthCookie(
    cookieStore.getAll().map(({ name }) => name),
  );
  const supabase = await createClient();

  try {
    const { data } = await supabase.auth.getClaims();

    return {
      claims: hasValidClaims(data?.claims) ? data.claims : null,
      hasSessionCookie,
    };
  } catch {
    return { claims: null, hasSessionCookie };
  }
}

import "server-only";

import { AppError } from "@/lib/http/app-error";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * ============================================================================
 * INTERIM IMPLEMENTATION. PERSON 2: PLEASE REPLACE WITH A SECURITY DEFINER
 * LOOKUP.
 * ============================================================================
 *
 * Resolving an email to a user id needs privileged access: `profiles` has no
 * email column and RLS only exposes the caller's own row, so the user-scoped
 * client cannot do it. Until the database has a purpose-built function, this
 * file scans the Supabase Auth admin user list with the service-role key.
 *
 * Why this is a stopgap and not the design we want:
 *  - It uses the service-role key (bypasses RLS) for a lookup that should
 *    only need "does an account with this email exist, and what is its id".
 *  - It lists users page by page and compares in memory. That is O(users).
 *    The scan is capped (MAX_PAGES x PER_PAGE users), so once the user base
 *    exceeds the cap an existing account is silently NOT found and the invite
 *    is a no-op for that recipient.
 *  - An unknown email scans every page while a known one can stop early, so
 *    response time can hint at account existence. The per-owner invite rate
 *    limiter (invite-rate-limit.ts) bounds how fast that can be probed, but
 *    does not remove it.
 *
 * Replacement: a `SECURITY DEFINER` SQL function, e.g.
 * `public.resolve_share_recipient(p_email text) returns uuid`, with a pinned
 * `search_path`, executable only by `authenticated` (or `service_role`), which
 * looks the email up by indexed equality in `auth.users` (confirmed emails
 * only) and returns just the id. Then only this file changes: keep the
 * `resolveRecipientByEmail(email)` signature and swap the body for an
 * `rpc()` call. No caller depends on how the lookup works.
 *
 * Hard rules for any implementation (kept here and tested):
 *  - Returns only a user id, to server code. Nothing from this module is ever
 *    serialized into a response, and emails are never logged.
 *  - Matches on a normalised (trimmed, lower-cased) email.
 *  - Only matches accounts whose email is confirmed, so someone cannot
 *    register an unconfirmed account with another person's email address and
 *    receive documents shared to it.
 */

/** Users requested per Auth admin call (Supabase allows up to 1000). */
export const RESOLVE_PER_PAGE = 200;
/** Max pages scanned per lookup: at most 2,000 users are ever inspected. */
export const RESOLVE_MAX_PAGES = 10;

export type AuthUserSummary = {
  id: string;
  email?: string | null;
  /** Timestamp when the email was confirmed; absent/null when unconfirmed. */
  emailConfirmedAt?: string | null;
};

export type AuthUserPage = {
  users: AuthUserSummary[];
  /** True when the Auth API reports another page after this one. */
  hasMore: boolean;
};

/** Source of Auth users, one page at a time (1-based). Seam for tests. */
export type AuthUserPageSource = (
  page: number,
  perPage: number,
) => Promise<AuthUserPage>;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Returns the id of the confirmed account that owns `email`, or null when
 * there is none (or it lies beyond the scan cap). The return value is for
 * server-side use only and must never be sent to a client.
 */
export async function resolveRecipientByEmail(
  email: string,
  source: AuthUserPageSource = adminAuthUserPageSource,
): Promise<string | null> {
  const wanted = normalizeEmail(email);
  if (wanted.length === 0) return null;

  for (let page = 1; page <= RESOLVE_MAX_PAGES; page += 1) {
    const { users, hasMore } = await source(page, RESOLVE_PER_PAGE);

    for (const user of users) {
      if (
        user.email &&
        user.emailConfirmedAt &&
        normalizeEmail(user.email) === wanted
      ) {
        return user.id;
      }
    }

    if (!hasMore || users.length === 0) return null;
  }

  return null;
}

/** Default source: the Supabase Auth admin API (service role). */
const adminAuthUserPageSource: AuthUserPageSource = async (page, perPage) => {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
  // Do not surface the provider error text; it can echo request details.
  if (error) throw new AppError("PROVIDER_UNAVAILABLE");

  return {
    users: data.users.map((user) => ({
      id: user.id,
      email: user.email,
      // email_confirmed_at only: confirmed_at also counts a phone confirmation.
      emailConfirmedAt: user.email_confirmed_at ?? null,
    })),
    hasMore: data.nextPage != null && data.users.length === perPage,
  };
};

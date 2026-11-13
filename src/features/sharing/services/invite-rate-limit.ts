/**
 * In-process sliding-window rate limiter for share invites, keyed by owner id.
 *
 * Limits how fast one owner can probe recipients (invites are the only place
 * an email is matched against accounts). State lives in this server process:
 * it resets on restart and is NOT shared across serverless instances or
 * regions, so it is a speed bump, not a hard guarantee. A durable limiter
 * (database or edge) should replace it if sharing ships beyond a demo.
 */

export type InviteRateLimiter = {
  /** Records an attempt and returns true, or returns false when over the limit. */
  consume: (ownerId: string) => boolean;
};

export type InviteRateLimiterOptions = {
  /** Attempts allowed per window. */
  limit?: number;
  windowMs?: number;
  /** Upper bound on tracked owners, so the map cannot grow without limit. */
  maxKeys?: number;
  now?: () => number;
};

export const INVITE_LIMIT = 10;
export const INVITE_WINDOW_MS = 60 * 60 * 1000;
const MAX_TRACKED_OWNERS = 5000;

export function createInviteRateLimiter(
  options: InviteRateLimiterOptions = {},
): InviteRateLimiter {
  const limit = options.limit ?? INVITE_LIMIT;
  const windowMs = options.windowMs ?? INVITE_WINDOW_MS;
  const maxKeys = options.maxKeys ?? MAX_TRACKED_OWNERS;
  const now = options.now ?? Date.now;
  const attempts = new Map<string, number[]>();

  function evictIfFull(): void {
    if (attempts.size < maxKeys) return;
    const cutoff = now() - windowMs;
    for (const [key, times] of attempts) {
      if (times.every((time) => time <= cutoff)) attempts.delete(key);
    }
    // Still full of active owners: drop the oldest-inserted one.
    if (attempts.size >= maxKeys) {
      const oldest = attempts.keys().next();
      if (!oldest.done) attempts.delete(oldest.value);
    }
  }

  return {
    consume(ownerId) {
      const current = now();
      const cutoff = current - windowMs;
      const recent = (attempts.get(ownerId) ?? []).filter(
        (time) => time > cutoff,
      );

      if (recent.length >= limit) {
        attempts.set(ownerId, recent);
        return false;
      }

      if (!attempts.has(ownerId)) evictIfFull();
      recent.push(current);
      attempts.set(ownerId, recent);
      return true;
    },
  };
}

/** Shared instance used by the route deps. */
export const inviteRateLimiter: InviteRateLimiter = createInviteRateLimiter();

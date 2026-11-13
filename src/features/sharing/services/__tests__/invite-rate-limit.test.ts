import { describe, expect, it } from "vitest";

import { createInviteRateLimiter } from "@/features/sharing/services/invite-rate-limit";

describe("createInviteRateLimiter", () => {
  it("allows up to the limit then blocks within the window", () => {
    let t = 1_000;
    const limiter = createInviteRateLimiter({
      limit: 3,
      windowMs: 1000,
      now: () => t,
    });

    expect([1, 2, 3].map(() => limiter.consume("a"))).toEqual([
      true,
      true,
      true,
    ]);
    expect(limiter.consume("a")).toBe(false);
    t += 500;
    expect(limiter.consume("a")).toBe(false);
  });

  it("frees quota as old attempts leave the window", () => {
    let t = 0;
    const limiter = createInviteRateLimiter({
      limit: 1,
      windowMs: 1000,
      now: () => t,
    });

    expect(limiter.consume("a")).toBe(true);
    expect(limiter.consume("a")).toBe(false);
    t = 1001;
    expect(limiter.consume("a")).toBe(true);
  });

  it("tracks owners independently", () => {
    const limiter = createInviteRateLimiter({ limit: 1, now: () => 0 });
    expect(limiter.consume("a")).toBe(true);
    expect(limiter.consume("b")).toBe(true);
    expect(limiter.consume("a")).toBe(false);
  });

  it("bounds the number of tracked owners", () => {
    const limiter = createInviteRateLimiter({
      limit: 1,
      maxKeys: 2,
      now: () => 0,
    });
    limiter.consume("a");
    limiter.consume("b");
    // "c" evicts the oldest tracked owner ("a"), so "a" starts fresh.
    limiter.consume("c");
    expect(limiter.consume("a")).toBe(true);
  });
});

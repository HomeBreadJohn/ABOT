import { describe, expect, it, vi } from "vitest";

import {
  RESOLVE_MAX_PAGES,
  RESOLVE_PER_PAGE,
  normalizeEmail,
  resolveRecipientByEmail,
  type AuthUserPage,
  type AuthUserPageSource,
} from "@/features/sharing/services/resolve-recipient";

const CONFIRMED = "2026-01-01T00:00:00Z";

function pagedSource(pages: AuthUserPage[]) {
  return vi.fn<AuthUserPageSource>(async (page) => {
    return pages[page - 1] ?? { users: [], hasMore: false };
  });
}

describe("resolveRecipientByEmail", () => {
  it("matches a normalised email regardless of case and whitespace", async () => {
    const source = pagedSource([
      {
        users: [
          {
            id: "u1",
            email: "Maria.Santos@Example.com",
            emailConfirmedAt: CONFIRMED,
          },
        ],
        hasMore: false,
      },
    ]);

    expect(
      await resolveRecipientByEmail("  maria.santos@example.COM ", source),
    ).toBe("u1");
  });

  it("returns null for an unknown email", async () => {
    const source = pagedSource([
      {
        users: [
          { id: "u1", email: "a@example.com", emailConfirmedAt: CONFIRMED },
        ],
        hasMore: false,
      },
    ]);
    expect(await resolveRecipientByEmail("b@example.com", source)).toBeNull();
  });

  it("does not match partial or prefix emails", async () => {
    const source = pagedSource([
      {
        users: [
          { id: "u1", email: "ann@example.com", emailConfirmedAt: CONFIRMED },
        ],
        hasMore: false,
      },
    ]);
    expect(await resolveRecipientByEmail("an@example.com", source)).toBeNull();
    expect(
      await resolveRecipientByEmail("joann@example.com", source),
    ).toBeNull();
  });

  it("ignores accounts whose email is not confirmed", async () => {
    const source = pagedSource([
      {
        users: [
          { id: "u1", email: "a@example.com", emailConfirmedAt: null },
          { id: "u2", email: "a@example.com" },
        ],
        hasMore: false,
      },
    ]);
    expect(await resolveRecipientByEmail("a@example.com", source)).toBeNull();
  });

  it("finds a user on a later page and stops scanning once found", async () => {
    const source = pagedSource([
      {
        users: [
          { id: "u1", email: "a@example.com", emailConfirmedAt: CONFIRMED },
        ],
        hasMore: true,
      },
      {
        users: [
          { id: "u2", email: "b@example.com", emailConfirmedAt: CONFIRMED },
        ],
        hasMore: true,
      },
      {
        users: [
          { id: "u3", email: "c@example.com", emailConfirmedAt: CONFIRMED },
        ],
        hasMore: false,
      },
    ]);

    expect(await resolveRecipientByEmail("b@example.com", source)).toBe("u2");
    expect(source).toHaveBeenCalledTimes(2);
    expect(source).toHaveBeenCalledWith(1, RESOLVE_PER_PAGE);
  });

  it("caps pagination at the maximum number of pages", async () => {
    const source = vi.fn<AuthUserPageSource>(async () => ({
      users: [
        { id: "x", email: "other@example.com", emailConfirmedAt: CONFIRMED },
      ],
      hasMore: true,
    }));

    expect(await resolveRecipientByEmail("a@example.com", source)).toBeNull();
    expect(source).toHaveBeenCalledTimes(RESOLVE_MAX_PAGES);
  });

  it("returns null for a blank email without calling the source", async () => {
    const source = pagedSource([]);
    expect(await resolveRecipientByEmail("   ", source)).toBeNull();
    expect(source).not.toHaveBeenCalled();
  });

  it("returns only a user id string, never the user record", async () => {
    const source = pagedSource([
      {
        users: [
          { id: "u1", email: "a@example.com", emailConfirmedAt: CONFIRMED },
        ],
        hasMore: false,
      },
    ]);
    const result = await resolveRecipientByEmail("a@example.com", source);
    expect(typeof result).toBe("string");
    expect(result).toBe("u1");
  });
});

describe("normalizeEmail", () => {
  it("trims and lower-cases", () => {
    expect(normalizeEmail("  A@B.Com ")).toBe("a@b.com");
  });
});

import { describe, expect, it } from "vitest";

import {
  INVITE_RESPONSE_MESSAGE,
  type SharePermission,
} from "@/features/sharing/schemas";
import { createInviteRateLimiter } from "@/features/sharing/services/invite-rate-limit";
import {
  inviteToShare,
  listShares,
  revokeShare,
  type ShareRow,
  type SharesDeps,
} from "@/features/sharing/services/shares";
import { AppError } from "@/lib/http/app-error";

const OWNER = crypto.randomUUID();
const OTHER_USER = crypto.randomUUID();
const KNOWN_USER = crypto.randomUUID();
const DOC = crypto.randomUUID();
const OTHER_DOC = crypto.randomUUID();

type StoredShare = ShareRow & { owner_id: string; shared_with_user_id: string };

/** In-memory stand-in for the database, the Auth lookup and the limiter. */
function createFakeDeps(options: { quota?: number } = {}) {
  const shares: StoredShare[] = [];
  const lookups: string[] = [];
  const limiter = createInviteRateLimiter({ limit: options.quota ?? 100 });
  // The document DOC belongs to OWNER; OTHER_DOC belongs to OTHER_USER.
  const owners = new Map([
    [DOC, OWNER],
    [OTHER_DOC, OTHER_USER],
  ]);
  const accounts = new Map([
    ["known@example.com", KNOWN_USER],
    ["owner@example.com", OWNER],
  ]);

  const deps: SharesDeps = {
    async ownsDocument(userId, documentId) {
      return owners.get(documentId) === userId;
    },
    async listShares(userId, documentId) {
      return shares
        .filter((s) => s.document_id === documentId && s.owner_id === userId)
        .map(({ id, document_id, permission, created_at }) => ({
          id,
          document_id,
          permission,
          created_at,
        }));
    },
    async insertShare(input) {
      const duplicate = shares.some(
        (s) =>
          s.document_id === input.documentId &&
          s.shared_with_user_id === input.sharedWithUserId,
      );
      if (duplicate) return "DUPLICATE";
      shares.push({
        id: crypto.randomUUID(),
        document_id: input.documentId,
        owner_id: input.ownerId,
        shared_with_user_id: input.sharedWithUserId,
        permission: input.permission,
        created_at: "2026-11-20T08:00:00.000+00:00",
      });
      return "CREATED";
    },
    async deleteShare(userId, documentId, shareId) {
      const index = shares.findIndex(
        (s) =>
          s.id === shareId &&
          s.document_id === documentId &&
          s.owner_id === userId,
      );
      if (index === -1) return false;
      shares.splice(index, 1);
      return true;
    },
    async resolveRecipientByEmail(email) {
      lookups.push(email);
      return accounts.get(email) ?? null;
    },
    consumeInviteQuota: (ownerId) => limiter.consume(ownerId),
  };

  return { deps, shares, lookups };
}

async function expectCode(promise: Promise<unknown>, code: string) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).code).toBe(code);
}

const invite = (email: string, permission: SharePermission = "viewer") => ({
  email,
  permission,
});

describe("inviteToShare", () => {
  it("returns an identical response for an unknown and a known email", async () => {
    const { deps, shares } = createFakeDeps();

    const unknown = await inviteToShare(
      OWNER,
      DOC,
      invite("nobody@example.com"),
      deps,
    );
    const known = await inviteToShare(
      OWNER,
      DOC,
      invite("known@example.com"),
      deps,
    );

    expect(known).toEqual(unknown);
    expect(known).toEqual({
      status: "ACCEPTED",
      message: INVITE_RESPONSE_MESSAGE,
    });
    // Only the real account produced a row.
    expect(shares).toHaveLength(1);
    expect(shares[0].shared_with_user_id).toBe(KNOWN_USER);
    expect(shares[0].owner_id).toBe(OWNER);
  });

  it("does not leak the recipient id or email in the response", async () => {
    const { deps } = createFakeDeps();
    const body = JSON.stringify(
      await inviteToShare(OWNER, DOC, invite("known@example.com"), deps),
    );
    expect(body).not.toContain(KNOWN_USER);
    expect(body).not.toContain("known@example.com");
  });

  it("rejects inviting yourself", async () => {
    const { deps, shares } = createFakeDeps();
    await expectCode(
      inviteToShare(OWNER, DOC, invite("owner@example.com"), deps),
      "INVALID_REQUEST",
    );
    expect(shares).toHaveLength(0);
  });

  it("rejects duplicates without a second row and without a distinct response", async () => {
    const { deps, shares } = createFakeDeps();
    const first = await inviteToShare(
      OWNER,
      DOC,
      invite("known@example.com", "viewer"),
      deps,
    );
    const second = await inviteToShare(
      OWNER,
      DOC,
      invite("known@example.com", "editor"),
      deps,
    );

    expect(second).toEqual(first);
    expect(shares).toHaveLength(1);
    // The existing permission is not silently changed.
    expect(shares[0].permission).toBe("viewer");
  });

  it("returns NOT_FOUND for a non-owner and never resolves the email", async () => {
    const { deps, shares, lookups } = createFakeDeps();
    await expectCode(
      inviteToShare(OWNER, OTHER_DOC, invite("known@example.com"), deps),
      "NOT_FOUND",
    );
    expect(lookups).toHaveLength(0);
    expect(shares).toHaveLength(0);
  });

  it("rate limits per owner, counting unknown emails too", async () => {
    const { deps, lookups } = createFakeDeps({ quota: 2 });
    await inviteToShare(OWNER, DOC, invite("a@example.com"), deps);
    await inviteToShare(OWNER, DOC, invite("b@example.com"), deps);

    await expectCode(
      inviteToShare(OWNER, DOC, invite("known@example.com"), deps),
      "RATE_LIMITED",
    );
    // The blocked attempt never reached the account lookup.
    expect(lookups).toEqual(["a@example.com", "b@example.com"]);
  });
});

describe("listShares", () => {
  it("lists only permission, id and date, with no recipient identity", async () => {
    const { deps } = createFakeDeps();
    await inviteToShare(
      OWNER,
      DOC,
      invite("known@example.com", "editor"),
      deps,
    );

    const result = await listShares(OWNER, DOC, deps);

    expect(result.shares).toHaveLength(1);
    expect(Object.keys(result.shares[0]).sort()).toEqual([
      "createdAt",
      "documentId",
      "permission",
      "shareId",
    ]);
    expect(result.shares[0].permission).toBe("editor");
    expect(result.shares[0].createdAt).toBe("2026-11-20T08:00:00.000Z");
    expect(JSON.stringify(result)).not.toContain(KNOWN_USER);
  });

  it("returns NOT_FOUND for a non-owner", async () => {
    const { deps } = createFakeDeps();
    await expectCode(listShares(OWNER, OTHER_DOC, deps), "NOT_FOUND");
    await expectCode(listShares(KNOWN_USER, DOC, deps), "NOT_FOUND");
  });
});

describe("revokeShare", () => {
  it("revokes the owner's own share", async () => {
    const { deps, shares } = createFakeDeps();
    await inviteToShare(OWNER, DOC, invite("known@example.com"), deps);
    const shareId = shares[0].id;

    const result = await revokeShare(OWNER, DOC, shareId, deps);

    expect(result).toEqual({ shareId, documentId: DOC });
    expect(shares).toHaveLength(0);
  });

  it("returns NOT_FOUND for a non-owner and leaves the share in place", async () => {
    const { deps, shares } = createFakeDeps();
    await inviteToShare(OWNER, DOC, invite("known@example.com"), deps);

    // The recipient and a stranger both fail the ownership check.
    await expectCode(
      revokeShare(KNOWN_USER, DOC, shares[0].id, deps),
      "NOT_FOUND",
    );
    await expectCode(
      revokeShare(OTHER_USER, DOC, shares[0].id, deps),
      "NOT_FOUND",
    );
    expect(shares).toHaveLength(1);
  });

  it("returns NOT_FOUND for a share id that belongs to another document", async () => {
    const { deps, shares } = createFakeDeps();
    shares.push({
      id: crypto.randomUUID(),
      document_id: OTHER_DOC,
      owner_id: OTHER_USER,
      shared_with_user_id: KNOWN_USER,
      permission: "viewer",
      created_at: "2026-11-20T08:00:00.000Z",
    });

    // OWNER owns DOC but the share row belongs to OTHER_USER's document.
    await expectCode(revokeShare(OWNER, DOC, shares[0].id, deps), "NOT_FOUND");
    expect(shares).toHaveLength(1);
  });

  it("returns NOT_FOUND for an unknown share id", async () => {
    const { deps } = createFakeDeps();
    await expectCode(
      revokeShare(OWNER, DOC, crypto.randomUUID(), deps),
      "NOT_FOUND",
    );
  });
});

import { describe, expect, it } from "vitest";

import {
  inviteShareRequestSchema,
  revokeShareParamsSchema,
} from "@/features/sharing/schemas";

describe("inviteShareRequestSchema", () => {
  it("accepts a valid body and normalises the email", () => {
    expect(
      inviteShareRequestSchema.parse({
        email: "  Maria@Example.COM ",
        permission: "editor",
      }),
    ).toEqual({ email: "maria@example.com", permission: "editor" });
  });

  it.each([
    ["ownerId", { ownerId: crypto.randomUUID() }],
    ["owner_id", { owner_id: crypto.randomUUID() }],
    ["userId", { userId: crypto.randomUUID() }],
    ["sharedWithUserId", { sharedWithUserId: crypto.randomUUID() }],
  ])("rejects a body that carries %s", (_name, extra) => {
    const result = inviteShareRequestSchema.safeParse({
      email: "a@example.com",
      permission: "viewer",
      ...extra,
    });
    expect(result.success).toBe(false);
  });

  it.each([
    [{ email: "not-an-email", permission: "viewer" }],
    [{ email: "a@example.com", permission: "owner" }],
    [{ email: "a@example.com" }],
    [{ permission: "viewer" }],
    [{ email: `${"a".repeat(250)}@example.com`, permission: "viewer" }],
    [{ email: 42, permission: "viewer" }],
  ])("rejects invalid body %j", (body) => {
    expect(inviteShareRequestSchema.safeParse(body).success).toBe(false);
  });
});

describe("revokeShareParamsSchema", () => {
  it("requires uuid ids", () => {
    expect(
      revokeShareParamsSchema.safeParse({
        documentId: crypto.randomUUID(),
        shareId: crypto.randomUUID(),
      }).success,
    ).toBe(true);
    expect(
      revokeShareParamsSchema.safeParse({
        documentId: "x",
        shareId: crypto.randomUUID(),
      }).success,
    ).toBe(false);
  });
});

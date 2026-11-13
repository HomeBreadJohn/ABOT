import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "@/lib/http/app-error";

// Only the auth boundary is replaced. Validation and error mapping run for real;
// the cases below all finish before any database call, so no client is needed.
const requireUser = vi.fn();
vi.mock("@/lib/auth/require-user", () => ({
  requireUser: () => requireUser(),
}));

import { DELETE, PATCH } from "@/app/api/reminders/[reminderId]/route";
import { GET, POST } from "@/app/api/reminders/route";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const REMINDER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const validBody = { title: "Pay bill", dueAt: "2026-12-01T00:00:00Z" };

function req(method: string, body?: string): Request {
  return new Request("http://localhost/api/reminders", {
    method,
    ...(body === undefined
      ? {}
      : { body, headers: { "content-type": "application/json" } }),
  });
}

const ctx = (reminderId: string) => ({
  params: Promise.resolve({ reminderId }),
});

async function errorCode(response: Response) {
  const json = (await response.json()) as { error: { code: string } };
  return json.error.code;
}

beforeEach(() => {
  requireUser.mockReset();
  requireUser.mockResolvedValue({ userId: USER_ID, supabase: {} });
});

describe("/api/reminders auth", () => {
  it("returns 401 UNAUTHENTICATED on every verb without a session", async () => {
    requireUser.mockRejectedValue(new AppError("UNAUTHENTICATED"));

    const responses = await Promise.all([
      GET(),
      POST(req("POST", JSON.stringify(validBody))),
      PATCH(req("PATCH", "{}"), ctx(REMINDER_ID)),
      DELETE(req("DELETE"), ctx(REMINDER_ID)),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(401);
      expect(await errorCode(response)).toBe("UNAUTHENTICATED");
    }
  });
});

describe("POST /api/reminders validation", () => {
  it.each(["userId", "user_id", "extra"])(
    "rejects an unknown or owner key (%s) with 400",
    async (key) => {
      const response = await POST(
        req("POST", JSON.stringify({ ...validBody, [key]: USER_ID })),
      );
      expect(response.status).toBe(400);
      expect(await errorCode(response)).toBe("INVALID_REQUEST");
    },
  );

  it("rejects an invalid due date, malformed JSON and an empty body with 400", async () => {
    for (const body of [
      JSON.stringify({ ...validBody, dueAt: "tomorrow" }),
      "{not json",
      "",
    ]) {
      const response = await POST(req("POST", body));
      expect(response.status).toBe(400);
      expect(await errorCode(response)).toBe("INVALID_REQUEST");
    }
  });
});

describe("/api/reminders/[reminderId]", () => {
  it("PATCH rejects an owner id in the body with 400", async () => {
    const response = await PATCH(
      req("PATCH", JSON.stringify({ title: "t", userId: USER_ID })),
      ctx(REMINDER_ID),
    );
    expect(response.status).toBe(400);
  });

  it("PATCH and DELETE return 404 NOT_FOUND for a malformed id", async () => {
    const patch = await PATCH(req("PATCH", "{}"), ctx("not-a-uuid"));
    expect(patch.status).toBe(404);
    expect(await errorCode(patch)).toBe("NOT_FOUND");

    const del = await DELETE(req("DELETE"), ctx("not-a-uuid"));
    expect(del.status).toBe(404);
    expect(await errorCode(del)).toBe("NOT_FOUND");
  });

  it("DELETE rejects a non-empty body with 400", async () => {
    const response = await DELETE(
      req("DELETE", JSON.stringify({ userId: USER_ID })),
      ctx(REMINDER_ID),
    );
    expect(response.status).toBe(400);
  });
});

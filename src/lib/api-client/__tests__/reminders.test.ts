import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiClientError } from "@/lib/api-client/client";
import {
  createReminder,
  deleteReminder,
  listReminders,
  updateReminder,
} from "@/lib/api-client/reminders";

const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";

function reminder(overrides: Record<string, unknown> = {}) {
  return {
    id: ID,
    documentId: null,
    title: "Pay bill",
    dueAt: "2026-12-01T00:00:00.000Z",
    status: "ACTIVE",
    notes: null,
    ...overrides,
  };
}

function stub(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function lastCall(fetchMock: ReturnType<typeof vi.fn>) {
  const [url, init] = fetchMock.mock.calls[0];
  return {
    url: url as string,
    method: (init?.method as string) ?? "GET",
    body: init?.body as string | undefined,
    credentials: init?.credentials as string | undefined,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("reminders client", () => {
  it("listReminders GETs /api/reminders", async () => {
    const fetchMock = stub({ reminders: [reminder()] });

    const out = await listReminders();

    const call = lastCall(fetchMock);
    expect(call.url).toBe("/api/reminders");
    expect(call.method).toBe("GET");
    expect(call.credentials).toBe("same-origin");
    expect(out.reminders).toHaveLength(1);
  });

  it("createReminder POSTs the body to /api/reminders", async () => {
    const input = {
      title: "Pay bill",
      dueAt: "2026-12-01T00:00:00Z",
      notes: "n",
    };
    const fetchMock = stub(reminder({ notes: "n" }));

    const out = await createReminder(input);

    const call = lastCall(fetchMock);
    expect(call.url).toBe("/api/reminders");
    expect(call.method).toBe("POST");
    expect(JSON.parse(call.body!)).toEqual(input);
    expect(out.id).toBe(ID);
  });

  it("updateReminder PATCHes /api/reminders/:id with the update body", async () => {
    const fetchMock = stub(reminder({ status: "DONE" }));

    const out = await updateReminder(ID, { status: "DONE" });

    const call = lastCall(fetchMock);
    expect(call.url).toBe(`/api/reminders/${ID}`);
    expect(call.method).toBe("PATCH");
    expect(JSON.parse(call.body!)).toEqual({ status: "DONE" });
    expect(out.status).toBe("DONE");
  });

  it("deleteReminder DELETEs /api/reminders/:id without a body", async () => {
    const fetchMock = stub({ reminderId: ID });

    const out = await deleteReminder(ID);

    const call = lastCall(fetchMock);
    expect(call.url).toBe(`/api/reminders/${ID}`);
    expect(call.method).toBe("DELETE");
    expect(call.body).toBeUndefined();
    expect(out).toEqual({ reminderId: ID });
  });

  it("rejects a response that violates the contract schema", async () => {
    stub({ reminders: [reminder({ dueAt: "not-a-date" })] });
    await expect(listReminders()).rejects.toThrow();
  });

  it("maps a non-2xx error body to ApiClientError", async () => {
    stub(
      {
        error: {
          code: "NOT_FOUND",
          message: "Not found.",
          requestId: crypto.randomUUID(),
        },
      },
      404,
    );

    const error = await updateReminder(ID, { title: "x" }).catch((e) => e);

    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({ code: "NOT_FOUND", status: 404 });
  });
});

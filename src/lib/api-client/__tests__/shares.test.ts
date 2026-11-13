import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiClientError } from "@/lib/api-client/client";
import {
  inviteToShare,
  listShares,
  revokeShare,
} from "@/lib/api-client/shares";

const DOC = crypto.randomUUID();
const SHARE = crypto.randomUUID();

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

function firstCall(fetchMock: ReturnType<typeof vi.fn>) {
  const [url, init] = fetchMock.mock.calls[0];
  return {
    url: url as string,
    method: (init?.method as string) ?? "GET",
    body: init?.body as string | undefined,
    credentials: init?.credentials as string | undefined,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("shares api client", () => {
  it("listShares GETs the document's shares and validates the body", async () => {
    const body = {
      shares: [
        {
          shareId: SHARE,
          documentId: DOC,
          permission: "viewer",
          createdAt: "2026-11-20T08:00:00.000Z",
        },
      ],
    };
    const fetchMock = stub(body);

    expect(await listShares(DOC)).toEqual(body);

    const call = firstCall(fetchMock);
    expect(call.url).toBe(`/api/documents/${DOC}/shares`);
    expect(call.method).toBe("GET");
    expect(call.credentials).toBe("same-origin");
  });

  it("inviteToShare POSTs only email and permission", async () => {
    const reply = {
      status: "ACCEPTED",
      message: "If this person has an account, they will see the document.",
    };
    const fetchMock = stub(reply);

    expect(
      await inviteToShare(DOC, {
        email: "a@example.com",
        permission: "editor",
      }),
    ).toEqual(reply);

    const call = firstCall(fetchMock);
    expect(call.url).toBe(`/api/documents/${DOC}/shares`);
    expect(call.method).toBe("POST");
    expect(JSON.parse(call.body!)).toEqual({
      email: "a@example.com",
      permission: "editor",
    });
  });

  it("revokeShare DELETEs the share", async () => {
    const reply = { shareId: SHARE, documentId: DOC };
    const fetchMock = stub(reply);

    expect(await revokeShare(DOC, SHARE)).toEqual(reply);

    const call = firstCall(fetchMock);
    expect(call.url).toBe(`/api/documents/${DOC}/shares/${SHARE}`);
    expect(call.method).toBe("DELETE");
  });

  it("maps an error response to ApiClientError with the contract code", async () => {
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

    const error = await listShares(DOC).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiClientError);
    expect((error as ApiClientError).code).toBe("NOT_FOUND");
    expect((error as ApiClientError).status).toBe(404);
  });

  it("rejects a response that does not match the schema", async () => {
    stub({ status: "OK" });
    await expect(
      inviteToShare(DOC, { email: "a@example.com", permission: "viewer" }),
    ).rejects.toThrow();
  });
});

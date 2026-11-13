import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiClientError, apiFetch, uploadToSignedUrl } from "@/lib/api-client/client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiFetch", () => {
  it("sends same-origin credentials and returns the parsed JSON body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiFetch("/api/documents");

    expect(result).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/documents");
    expect(init.credentials).toBe("same-origin");
  });

  it("serializes a JSON body and sets the content-type header for a POST", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/api/documents", { method: "POST", body: { a: 1 } });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ a: 1 }));
    expect(new Headers(init.headers).get("content-type")).toBe("application/json");
  });

  it("throws ApiClientError carrying the contract error code and message on a non-2xx", async () => {
    const body = {
      error: { code: "NOT_FOUND", message: "Gone", requestId: crypto.randomUUID() },
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(body, 404));
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiFetch("/api/documents/x")).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Gone",
      status: 404,
    });
    await expect(apiFetch("/api/documents/x")).rejects.toBeInstanceOf(ApiClientError);
  });

  it("falls back to INTERNAL_ERROR when a non-2xx body is not the contract shape", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("<html>502</html>", { status: 502 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiFetch("/api/documents")).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
      status: 502,
    });
  });

  it("validates the response body against a provided schema", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ wrong: true }));
    vi.stubGlobal("fetch", fetchMock);

    const { z } = await import("zod");
    const schema = z.object({ documents: z.array(z.unknown()) });

    await expect(apiFetch("/api/documents", { schema })).rejects.toBeTruthy();
  });
});

describe("uploadToSignedUrl", () => {
  it("PUTs the raw file bytes to the signed URL with the file content-type", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const file = new File(["bytes"], "doc.pdf", { type: "application/pdf" });

    await uploadToSignedUrl("https://storage.example/signed", file);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://storage.example/signed");
    expect(init.method).toBe("PUT");
    expect(init.body).toBe(file);
    expect(new Headers(init.headers).get("content-type")).toBe("application/pdf");
  });

  it("throws ApiClientError when the storage upload fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);
    const file = new File(["bytes"], "doc.pdf", { type: "application/pdf" });

    await expect(uploadToSignedUrl("https://storage.example/signed", file)).rejects.toBeInstanceOf(
      ApiClientError,
    );
  });
});

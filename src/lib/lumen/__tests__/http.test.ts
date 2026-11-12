import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { logger } from "@/lib/logging/logger";
import { LumenError } from "@/lib/lumen/errors";
import { lumenRequest } from "@/lib/lumen/http";

const LUMEN_ENV = {
  PROVIDER_MODE: "lumen",
  LUMEN_API_KEY: "key-123",
  LUMEN_API_SECRET: "secret-456",
  LUMEN_OCR_BASE_URL: "https://ocr.example.test/ocr",
  LUMEN_AI_CHAT_BASE_URL: "https://chat.example.test/ai_chat",
};

function withLumenEnv() {
  Object.assign(process.env, LUMEN_ENV);
}

const schema = z.object({ DocumentID: z.string() });

/** A fake transport recording the single request it receives. */
function fakeTransport(response: Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  const transport = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return response;
  };
  return { transport, calls };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("lumenRequest", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    for (const key of Object.keys(LUMEN_ENV)) delete process.env[key];
  });

  it("sends both auth headers and unwraps the { data, requestId } envelope", async () => {
    withLumenEnv();
    const { transport, calls } = fakeTransport(
      jsonResponse({ data: { DocumentID: "doc-1" }, requestId: "r-1" }),
    );

    const result = await lumenRequest({
      base: "ocr",
      path: "/documents/doc-1",
      method: "GET",
      schema,
      operation: "ocr_get_document",
      transport,
    });

    expect(result).toEqual({ DocumentID: "doc-1" });
    expect(calls).toHaveLength(1);
    const headers = new Headers(calls[0].init.headers);
    expect(headers.get("lumen-api-key")).toBe("key-123");
    expect(headers.get("lumen-api-secret")).toBe("secret-456");
    expect(calls[0].url).toBe("https://ocr.example.test/ocr/documents/doc-1");
  });

  it.each([
    [401, "INVALID_API_CREDENTIALS", "UNAUTHORIZED"],
    [403, "ACCESS_DENIED", "UNAUTHORIZED"],
    [403, "VIEW_ONLY_ACCESS", "UNAUTHORIZED"],
    [403, "API_CREDITS_INSUFFICIENT", "CREDITS_INSUFFICIENT"],
    [403, "LC_INSUFFICIENT", "CREDITS_INSUFFICIENT"],
    [404, "NOT_FOUND", "NOT_FOUND"],
    [409, "OCR_DOCUMENT_NOT_RETRYABLE", "CONFLICT"],
    [429, "RATE_LIMIT_EXCEEDED", "RATE_LIMITED"],
    [502, "BAD_GATEWAY", "UNAVAILABLE"],
    [503, "OCR_NOT_CONFIGURED", "UNAVAILABLE"],
  ] as const)(
    "maps HTTP %s %s to LumenError %s",
    async (status, code, expectedCode) => {
      withLumenEnv();
      const { transport } = fakeTransport(
        jsonResponse({ error: { code, message: "boom" } }, status),
      );

      await expect(
        lumenRequest({
          base: "ocr",
          path: "/x",
          method: "GET",
          schema,
          operation: "ocr_get_document",
          transport,
        }),
      ).rejects.toMatchObject({ code: expectedCode });
    },
  );

  it("maps a schema failure to INVALID_RESPONSE without leaking the body", async () => {
    withLumenEnv();
    const secretBody = { data: { WrongField: "leaky-secret-text" }, requestId: "r" };
    const { transport } = fakeTransport(jsonResponse(secretBody));

    const error = await lumenRequest({
      base: "ocr",
      path: "/x",
      method: "GET",
      schema,
      operation: "ocr_get_document",
      transport,
    }).catch((e) => e as LumenError);

    expect(error).toBeInstanceOf(LumenError);
    expect((error as LumenError).code).toBe("INVALID_RESPONSE");
    expect((error as LumenError).message).not.toContain("leaky-secret-text");
  });

  it("does not leak the raw error body in the error message", async () => {
    withLumenEnv();
    const { transport } = fakeTransport(
      jsonResponse(
        { error: { code: "ACCESS_DENIED", message: "super-secret-detail" } },
        403,
      ),
    );

    const error = await lumenRequest({
      base: "ocr",
      path: "/x",
      method: "GET",
      schema,
      operation: "ocr_get_document",
      transport,
    }).catch((e) => e as LumenError);

    expect((error as LumenError).message).not.toContain("super-secret-detail");
  });

  it("aborts after the timeout with code TIMEOUT", async () => {
    withLumenEnv();
    const transport = (_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
      });

    const error = await lumenRequest({
      base: "ocr",
      path: "/x",
      method: "GET",
      schema,
      operation: "ocr_get_document",
      transport,
      timeoutMs: 10,
    }).catch((e) => e as LumenError);

    expect((error as LumenError).code).toBe("TIMEOUT");
  });

  it("writes exactly one structured log per call with only allowlisted keys", async () => {
    withLumenEnv();
    const infoSpy = vi.spyOn(logger, "info");
    const { transport } = fakeTransport(
      jsonResponse({ data: { DocumentID: "doc-1" }, requestId: "r-1" }),
    );

    await lumenRequest({
      base: "ocr",
      path: "/documents/doc-1",
      method: "GET",
      schema,
      operation: "ocr_get_document",
      transport,
    });

    expect(infoSpy).toHaveBeenCalledTimes(1);
    const [message, fields] = infoSpy.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    // operation travels in the message because the shared logger allowlist
    // (owned by A6) does not carry it.
    expect(message).toContain("ocr_get_document");
    const allowed = new Set(["status", "durationMs", "errorCode", "credits"]);
    for (const key of Object.keys(fields)) {
      expect(allowed.has(key)).toBe(true);
    }
    expect(fields.status).toBe(200);
  });
});

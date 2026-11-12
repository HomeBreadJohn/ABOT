import "server-only";

import type { ZodType } from "zod";

import { getProviderEnv } from "@/lib/env/server";
import { logger } from "@/lib/logging/logger";
import { CREDIT_COST, type LumenOperation } from "@/lib/lumen/credits";
import { LumenError, lumenErrorFromResponse } from "@/lib/lumen/errors";

const DEFAULT_TIMEOUT_MS = 30_000;

/** Pluggable fetch so unit tests run without a network. Defaults to global fetch. */
export type LumenTransport = (
  url: string,
  init: RequestInit,
) => Promise<Response>;

export type LumenRequestOptions<T> = {
  base: "ocr" | "ai_chat";
  path: string;
  method: "GET" | "POST";
  /** JSON body; serialized and sent as application/json. */
  body?: unknown;
  /** Raw bytes body (e.g. an uploaded document). */
  bodyBytes?: Uint8Array;
  /** Content-Type for a bodyBytes request. */
  contentType?: string;
  extraHeaders?: Record<string, string>;
  schema: ZodType<T>;
  operation: LumenOperation;
  timeoutMs?: number;
  transport?: LumenTransport;
  /**
   * OCR responses wrap their payload in `{ data, requestId }`; AI Chat
   * responses are top-level. Defaults to true to keep OCR behavior unchanged.
   */
  unwrapEnvelope?: boolean;
};

function baseUrl(base: "ocr" | "ai_chat"): string {
  const env = getProviderEnv();
  if (env.mode !== "lumen") {
    throw new Error("Lumen HTTP client requires PROVIDER_MODE=lumen.");
  }
  return base === "ocr" ? env.ocrBaseUrl : env.aiChatBaseUrl;
}

function authHeaders(): Record<string, string> {
  const env = getProviderEnv();
  if (env.mode !== "lumen") {
    throw new Error("Lumen HTTP client requires PROVIDER_MODE=lumen.");
  }
  return { "lumen-api-key": env.apiKey, "lumen-api-secret": env.apiSecret };
}

/**
 * Makes one authenticated Lumen request. Sends both auth headers, optionally
 * unwraps the `{ data, requestId }` envelope (OCR; `unwrapEnvelope` defaults to
 * true) or validates the raw body (AI Chat; `unwrapEnvelope: false`) with
 * `schema`, maps failures to `LumenError`, and writes exactly one structured
 * log line. The raw body is never logged or placed in an error.
 */
export async function lumenRequest<T>(opts: LumenRequestOptions<T>): Promise<T> {
  const {
    base,
    path,
    method,
    body,
    bodyBytes,
    contentType,
    extraHeaders,
    schema,
    operation,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    transport = globalThis.fetch,
    unwrapEnvelope = true,
  } = opts;

  const url = `${baseUrl(base)}${path}`;
  const headers: Record<string, string> = {
    ...authHeaders(),
    ...extraHeaders,
  };

  let payload: BodyInit | undefined;
  if (bodyBytes !== undefined) {
    payload = bodyBytes as unknown as BodyInit;
    if (contentType) headers["content-type"] = contentType;
  } else if (body !== undefined) {
    payload = JSON.stringify(body);
    headers["content-type"] = "application/json";
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();

  let status = 0;
  let errorCode: string | undefined;
  try {
    const response = await transport(url, {
      method,
      headers,
      body: payload,
      signal: controller.signal,
    });
    status = response.status;

    if (!response.ok) {
      const gatewayCode = await readGatewayCode(response);
      const error = lumenErrorFromResponse(response.status, gatewayCode);
      errorCode = error.code;
      throw error;
    }

    const rawBody = await response.json();
    const responseData = unwrapEnvelope
      ? (rawBody as { data?: unknown }).data
      : rawBody;
    const parsed = schema.safeParse(responseData);
    if (!parsed.success) {
      errorCode = "INVALID_RESPONSE";
      throw new LumenError("INVALID_RESPONSE", status);
    }
    return parsed.data;
  } catch (error) {
    if (error instanceof LumenError) throw error;
    if (isAbortError(error)) {
      errorCode = "TIMEOUT";
      throw new LumenError("TIMEOUT");
    }
    // Network or transport failure — never echo its message.
    errorCode = "UNAVAILABLE";
    throw new LumenError("UNAVAILABLE");
  } finally {
    clearTimeout(timer);
    logger.info(`lumen ${operation}`, {
      status,
      durationMs: Date.now() - started,
      errorCode,
      credits: CREDIT_COST[operation],
    });
  }
}

/** Reads `error.code` from a gateway failure body without surfacing its text. */
async function readGatewayCode(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as { error?: { code?: string } };
    return body.error?.code;
  } catch {
    return undefined;
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

import { afterEach, describe, expect, it } from "vitest";

import instancesFixture from "@/lib/lumen/__fixtures__/chat/instances.json";
import sessionFixture from "@/lib/lumen/__fixtures__/chat/session.json";
import messageFixture from "@/lib/lumen/__fixtures__/chat/message.json";
import { LumenChatProvider } from "@/lib/lumen/chat-client";

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

type RecordedCall = { url: string; method: string; init: RequestInit };

function recordingTransport(routes: (call: RecordedCall) => Response): {
  transport: (url: string, init: RequestInit) => Promise<Response>;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const transport = async (url: string, init: RequestInit) => {
    const call = { url, method: String(init.method), init };
    calls.push(call);
    return routes(call);
  };
  return { transport, calls };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("LumenChatProvider", () => {
  afterEach(() => {
    for (const key of Object.keys(LUMEN_ENV)) delete process.env[key];
    delete process.env.LUMEN_AI_INSTANCE_ID;
  });

  it("openSession lists instances, sends both auth headers, and returns ids", async () => {
    withLumenEnv();
    const { transport, calls } = recordingTransport((call) =>
      call.url.endsWith("/sessions")
        ? json(sessionFixture, 201)
        : json(instancesFixture),
    );

    const provider = new LumenChatProvider(transport);
    const result = await provider.openSession();

    expect(result).toEqual({
      sessionId: "sess-synthetic-0001",
      instanceId: "inst-synthetic-0001",
    });
    const instancesCall = calls.find((c) => c.url.endsWith("/instances"));
    expect(instancesCall?.url).toBe("https://chat.example.test/ai_chat/instances");
    const headers = new Headers(instancesCall?.init.headers);
    expect(headers.get("lumen-api-key")).toBe("key-123");
    expect(headers.get("lumen-api-secret")).toBe("secret-456");
    const sessionCall = calls.find((c) => c.url.endsWith("/sessions"));
    expect(sessionCall?.method).toBe("POST");
    expect(sessionCall?.url).toBe(
      "https://chat.example.test/ai_chat/instances/inst-synthetic-0001/sessions",
    );
  });

  it("openSession uses LUMEN_AI_INSTANCE_ID and skips listing when set", async () => {
    withLumenEnv();
    process.env.LUMEN_AI_INSTANCE_ID = "inst-env-override";
    const { transport, calls } = recordingTransport(() =>
      json(sessionFixture, 201),
    );

    const provider = new LumenChatProvider(transport);
    const result = await provider.openSession();

    expect(result.instanceId).toBe("inst-env-override");
    expect(calls.every((c) => !c.url.endsWith("/instances"))).toBe(true);
    expect(calls[0].url).toBe(
      "https://chat.example.test/ai_chat/instances/inst-env-override/sessions",
    );
  });

  it("send posts the message under the opened instance and returns Answer.answer", async () => {
    withLumenEnv();
    const { transport, calls } = recordingTransport((call) =>
      call.url.endsWith("/sessions")
        ? json(sessionFixture, 201)
        : call.url.endsWith("/messages")
          ? json(messageFixture)
          : json(instancesFixture),
    );

    const provider = new LumenChatProvider(transport);
    const { sessionId } = await provider.openSession();
    const result = await provider.send(sessionId, "classify this");

    expect(result.reply).toBe(messageFixture.Answer.answer);
    const messageCall = calls.find((c) => c.url.endsWith("/messages"));
    expect(messageCall?.method).toBe("POST");
    expect(messageCall?.url).toBe(
      "https://chat.example.test/ai_chat/instances/inst-synthetic-0001/sessions/sess-synthetic-0001/messages",
    );
  });

  it("send throws before any request when the message exceeds 4000 characters", async () => {
    withLumenEnv();
    const { transport, calls } = recordingTransport((call) =>
      call.url.endsWith("/sessions")
        ? json(sessionFixture, 201)
        : json(instancesFixture),
    );

    const provider = new LumenChatProvider(transport);
    const { sessionId } = await provider.openSession();
    const callsBefore = calls.length;
    await expect(
      provider.send(sessionId, "x".repeat(4001)),
    ).rejects.toBeDefined();
    expect(calls).toHaveLength(callsBefore);
  });
});

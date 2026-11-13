import { describe, expect, it } from "vitest";
import { z } from "zod";

import { requestJson } from "@/features/intelligence/services/json-reply";
import {
  CHAT_MESSAGE_MAX_LENGTH,
  type ChatProvider,
} from "@/lib/providers/chat-provider";

const schema = z.object({ category: z.string(), confidence: z.number() });

/** Fake chat that returns queued replies in order and records every message. */
class FakeChat implements ChatProvider {
  readonly sent: string[] = [];
  private readonly replies: string[];

  constructor(replies: string[]) {
    this.replies = replies;
  }

  async openSession() {
    return { sessionId: "s", instanceId: "i" };
  }

  async send(_sessionId: string, message: string) {
    this.sent.push(message);
    const reply = this.replies.shift() ?? "";
    return { reply };
  }
}

describe("requestJson", () => {
  it("extracts JSON from a prose-wrapped reply", async () => {
    const chat = new FakeChat([
      'Sure! Here is the result: {"category":"BILL","confidence":0.9} Hope that helps.',
    ]);

    const result = await requestJson(chat, "s", "analyze this", schema);

    expect(result).toEqual({ category: "BILL", confidence: 0.9 });
    expect(chat.sent).toHaveLength(1);
  });

  it("extracts JSON from a code-fenced reply", async () => {
    const chat = new FakeChat([
      '```json\n{"category":"BILL","confidence":0.5}\n```',
    ]);

    const result = await requestJson(chat, "s", "analyze this", schema);

    expect(result).toEqual({ category: "BILL", confidence: 0.5 });
    expect(chat.sent).toHaveLength(1);
  });

  it("sends one repair message after a parse failure then succeeds", async () => {
    const chat = new FakeChat([
      "I cannot produce JSON right now.",
      '{"category":"BILL","confidence":0.7}',
    ]);

    const result = await requestJson(chat, "s", "analyze this", schema);

    expect(result).toEqual({ category: "BILL", confidence: 0.7 });
    expect(chat.sent).toHaveLength(2);
    expect(chat.sent[1]).toContain("return only JSON");
  });

  it("throws INVALID_ANALYSIS when both replies fail", async () => {
    const chat = new FakeChat(["not json", "still not json"]);

    await expect(
      requestJson(chat, "s", "analyze this", schema),
    ).rejects.toMatchObject({ code: "INVALID_ANALYSIS" });
    expect(chat.sent).toHaveLength(2);
  });

  it("never sends more than 2 messages", async () => {
    const chat = new FakeChat(["bad", "bad", "good"]);

    await expect(
      requestJson(chat, "s", "analyze this", schema),
    ).rejects.toBeDefined();
    expect(chat.sent).toHaveLength(2);
  });

  it("throws before sending when the message exceeds the chat limit", async () => {
    const chat = new FakeChat(['{"category":"BILL","confidence":0.9}']);

    await expect(
      requestJson(chat, "s", "x".repeat(CHAT_MESSAGE_MAX_LENGTH + 1), schema),
    ).rejects.toBeDefined();
    expect(chat.sent).toHaveLength(0);
  });
});

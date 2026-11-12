import { describe, expect, it } from "vitest";

import { CHAT_MESSAGE_MAX_LENGTH } from "@/lib/providers/chat-provider";
import { MockChatProvider } from "@/lib/providers/mock/mock-chat-provider";
import { classifyDocument } from "@/features/intelligence/services/classify";

type Page = { pageNumber: number; text: string };

function pages(...texts: string[]): Page[] {
  return texts.map((text, i) => ({ pageNumber: i + 1, text }));
}

/** A chat provider that records every message it is sent. */
class RecordingChat extends MockChatProvider {
  readonly sent: string[] = [];
  async send(sessionId: string, message: string) {
    this.sent.push(message);
    return super.send(sessionId, message);
  }
}

function reply(obj: unknown): string {
  return JSON.stringify(obj);
}

describe("classifyDocument", () => {
  it("sends exactly one message of at most 4000 chars", async () => {
    const chat = new RecordingChat();
    chat.respondWith(
      () => true,
      reply({
        category: "UTILITIES",
        subtype: "Electricity bill",
        issuer: "Meralco",
        confidence: 0.95,
      }),
    );
    await classifyDocument(pages("Meralco electricity bill. Amount due."), chat);
    expect(chat.sent).toHaveLength(1);
    expect(chat.sent[0].length).toBeLessThanOrEqual(CHAT_MESSAGE_MAX_LENGTH);
  });

  it("uses only the first 2500 chars of page text", async () => {
    const chat = new RecordingChat();
    chat.respondWith(
      () => true,
      reply({ category: "OTHER", subtype: "", issuer: "", confidence: 0.9 }),
    );
    const head = "H".repeat(2500);
    const tail = "TAIL_MARKER";
    await classifyDocument(pages(head + tail), chat);
    expect(chat.sent[0]).not.toContain(tail);
  });

  it("returns the classified category on a confident reply", async () => {
    const chat = new MockChatProvider();
    chat.respondWith(
      () => true,
      reply({
        category: "FINANCIAL",
        subtype: "Loan statement",
        issuer: "BPI",
        confidence: 0.92,
      }),
    );
    const result = await classifyDocument(pages("Loan statement from BPI"), chat);
    expect(result.category).toBe("FINANCIAL");
    expect(result.subtype).toBe("Loan statement");
    expect(result.issuer).toBe("BPI");
    expect(result.ambiguous).toBe(false);
  });

  it("is ambiguous when confidence is below 0.7", async () => {
    const chat = new MockChatProvider();
    chat.respondWith(
      () => true,
      reply({
        category: "LEGAL",
        subtype: "Contract",
        issuer: "",
        confidence: 0.55,
      }),
    );
    const result = await classifyDocument(pages("some text"), chat);
    expect(result.category).toBe("LEGAL");
    expect(result.ambiguous).toBe(true);
  });

  it("is ambiguous when the top two candidates are within 0.15", async () => {
    const chat = new MockChatProvider();
    chat.respondWith(
      () => true,
      reply({
        category: "FINANCIAL",
        subtype: "",
        issuer: "",
        confidence: 0.8,
        candidates: [
          { category: "FINANCIAL", confidence: 0.8 },
          { category: "UTILITIES", confidence: 0.7 },
        ],
      }),
    );
    const result = await classifyDocument(pages("some text"), chat);
    expect(result.category).toBe("FINANCIAL");
    expect(result.ambiguous).toBe(true);
  });

  it("is not ambiguous when the top two candidates are far apart", async () => {
    const chat = new MockChatProvider();
    chat.respondWith(
      () => true,
      reply({
        category: "FINANCIAL",
        subtype: "",
        issuer: "",
        confidence: 0.9,
        candidates: [
          { category: "FINANCIAL", confidence: 0.9 },
          { category: "UTILITIES", confidence: 0.4 },
        ],
      }),
    );
    const result = await classifyDocument(pages("some text"), chat);
    expect(result.ambiguous).toBe(false);
  });

  it("strips code fences before parsing", async () => {
    const chat = new MockChatProvider();
    chat.respondWith(
      () => true,
      '```json\n{"category":"MEDICAL","subtype":"","issuer":"","confidence":0.9}\n```',
    );
    const result = await classifyDocument(pages("clinic results"), chat);
    expect(result.category).toBe("MEDICAL");
  });

  it("extracts the first JSON object from a prose-wrapped reply", async () => {
    const chat = new MockChatProvider();
    chat.respondWith(
      () => true,
      'Sure, here is the result: {"category":"EDUCATION","subtype":"","issuer":"","confidence":0.88} Hope that helps.',
    );
    const result = await classifyDocument(pages("enrollment form"), chat);
    expect(result.category).toBe("EDUCATION");
  });

  it("falls back to OTHER + ambiguous on an unparseable reply", async () => {
    const chat = new MockChatProvider();
    chat.respondWith(() => true, "I cannot help with that.");
    const result = await classifyDocument(pages("anything"), chat);
    expect(result.category).toBe("OTHER");
    expect(result.ambiguous).toBe(true);
  });

  it("falls back to OTHER + ambiguous when the category is not an enum value", async () => {
    const chat = new MockChatProvider();
    chat.respondWith(
      () => true,
      reply({ category: "TAXES", subtype: "", issuer: "", confidence: 0.9 }),
    );
    const result = await classifyDocument(pages("anything"), chat);
    expect(result.category).toBe("OTHER");
    expect(result.ambiguous).toBe(true);
  });
});

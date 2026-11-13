import { describe, expect, it } from "vitest";

import type { EvidenceReference } from "@/contracts";
import { buildCitations } from "@/features/documents/chat/citations";
import {
  composerState,
  MESSAGE_MAX_LENGTH,
  shouldSendOnKey,
} from "@/features/documents/chat/composer";
import {
  createSessionConversationStore,
  type StorageLike,
} from "@/features/documents/chat/conversation-store";
import {
  fromAnswer,
  fromHistory,
} from "@/features/documents/chat/chat-messages";
import {
  orderSuggestedPrompts,
  SUGGESTED_PROMPTS,
} from "@/features/documents/chat/suggested-prompts";

function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

const evidence: EvidenceReference[] = [
  {
    id: "ev-1",
    documentId: "doc-1",
    pageNumber: 2,
    excerpt: "Pay   within\n30 days.",
    sourceType: "OCR_TEXT",
  },
];

describe("composerState", () => {
  it("allows exactly 1000 characters and blocks 1001", () => {
    const at = composerState("a".repeat(1000), false);
    expect(at.overLimit).toBe(false);
    expect(at.canSend).toBe(true);

    const over = composerState("a".repeat(1001), false);
    expect(over.overLimit).toBe(true);
    expect(over.canSend).toBe(false);
    expect(over.counterLabel).toBe("1001 / 1000 · 1 over the limit");
    expect(MESSAGE_MAX_LENGTH).toBe(1000);
  });

  it("blocks send when empty, whitespace only, or sending", () => {
    expect(composerState("", false).canSend).toBe(false);
    expect(composerState("   \n", false).canSend).toBe(false);
    expect(composerState("hello", true).canSend).toBe(false);
    expect(composerState("hello", false).canSend).toBe(true);
  });

  it("announces only when the limit is close", () => {
    expect(composerState("a".repeat(100), false).announcement).toBe("");
    expect(composerState("a".repeat(950), false).announcement).toBe(
      "50 characters remaining.",
    );
    expect(composerState("a".repeat(999), false).announcement).toBe(
      "1 character remaining.",
    );
    expect(composerState("a".repeat(1003), false).announcement).toContain(
      "3 characters over the limit",
    );
  });
});

describe("shouldSendOnKey", () => {
  it("sends on Enter, not on Shift+Enter, other keys, or IME composition", () => {
    expect(shouldSendOnKey({ key: "Enter", shiftKey: false })).toBe(true);
    expect(shouldSendOnKey({ key: "Enter", shiftKey: true })).toBe(false);
    expect(shouldSendOnKey({ key: "a", shiftKey: false })).toBe(false);
    expect(
      shouldSendOnKey({ key: "Enter", shiftKey: false, isComposing: true }),
    ).toBe(false);
  });
});

describe("suggested prompts", () => {
  it("lists the five product.md 9.5 questions", () => {
    expect(SUGGESTED_PROMPTS.map((p) => p.text)).toEqual([
      "Explain this in simpler terms.",
      "What happens if I miss the deadline?",
      "Which part of the document says that?",
      "What should I ask the issuing office?",
      "Explain this in Filipino.",
    ]);
  });

  it("moves the Filipino question first for Filipino or Taglish readers", () => {
    expect(orderSuggestedPrompts("FIL")[0].id).toBe("filipino");
    expect(orderSuggestedPrompts("TAGLISH")[0].id).toBe("filipino");
    expect(orderSuggestedPrompts("FIL")).toHaveLength(5);
    expect(orderSuggestedPrompts("EN")).toBe(SUGGESTED_PROMPTS);
    expect(orderSuggestedPrompts()).toBe(SUGGESTED_PROMPTS);
  });
});

describe("buildCitations", () => {
  it("labels known evidence with its page and a flattened snippet", () => {
    const [citation] = buildCitations(["ev-1"], evidence);
    expect(citation.evidenceId).toBe("ev-1");
    expect(citation.label).toBe("Source 1 · Page 2");
    expect(citation.description.startsWith(citation.label)).toBe(true);
    expect(citation.description).toContain("Pay within 30 days.");
  });

  it("dedupes ids and labels unknown ids without inventing details", () => {
    const citations = buildCitations(["ev-1", "ev-1", "ev-9"], evidence);
    expect(citations.map((c) => c.label)).toEqual([
      "Source 1 · Page 2",
      "Source 2",
    ]);
  });

  it("returns nothing for no evidence ids", () => {
    expect(buildCitations([], evidence)).toEqual([]);
  });
});

describe("conversation store", () => {
  it("round-trips an id per document and clears it", () => {
    const storage = memoryStorage();
    const store = createSessionConversationStore(() => storage);
    expect(store.get("doc-1")).toBeNull();
    store.set("doc-1", "conv-1");
    store.set("doc-2", "conv-2");
    expect(store.get("doc-1")).toBe("conv-1");
    expect(store.get("doc-2")).toBe("conv-2");
    store.clear("doc-1");
    expect(store.get("doc-1")).toBeNull();
    expect(store.get("doc-2")).toBe("conv-2");
  });

  it("does not throw when storage is missing or blocked", () => {
    const missing = createSessionConversationStore(() => null);
    expect(() => missing.set("d", "c")).not.toThrow();
    expect(missing.get("d")).toBeNull();

    const blocked = createSessionConversationStore(() => {
      throw new Error("blocked");
    });
    expect(blocked.get("d")).toBeNull();
    expect(() => blocked.clear("d")).not.toThrow();
  });
});

describe("message mapping", () => {
  it("maps history roles and defaults missing evidence ids", () => {
    expect(
      fromHistory({
        id: "m1",
        role: "USER",
        content: "hi",
        createdAt: "2026-01-01T00:00:00Z",
      }),
    ).toMatchObject({ role: "user", evidenceIds: [] });
    expect(
      fromHistory({
        id: "m2",
        role: "ASSISTANT",
        content: "yo",
        evidenceIds: ["ev-1"],
        createdAt: "2026-01-01T00:00:00Z",
      }),
    ).toMatchObject({ role: "assistant", evidenceIds: ["ev-1"] });
  });

  it("drops citations from a not-found answer", () => {
    const message = fromAnswer({
      messageId: "m3",
      answer: "guess",
      evidenceIds: ["ev-1"],
      notFoundInDocument: true,
    });
    expect(message.notFoundInDocument).toBe(true);
    expect(message.evidenceIds).toEqual([]);
  });
});

import { beforeEach, describe, expect, it } from "vitest";

import { MockChatProvider } from "@/lib/providers/mock/mock-chat-provider";
import {
  askQuestion,
  openConversation,
  type ConversationsDeps,
  type StoredMessage,
} from "@/features/conversations/services/conversations";

/** In-memory conversation store that mirrors the DB shape we rely on. */
class FakeStore {
  conversations = new Map<
    string,
    { id: string; userId: string; documentId: string; sessionId: string | null }
  >();
  messages: StoredMessage[] = [];
  private idSeq = 0;

  private id(prefix: string) {
    this.idSeq += 1;
    return `${prefix}-${this.idSeq}`;
  }

  createConversation(userId: string, documentId: string) {
    const id = this.id("conv");
    this.conversations.set(id, { id, userId, documentId, sessionId: null });
    return id;
  }

  getConversation(conversationId: string) {
    return this.conversations.get(conversationId) ?? null;
  }

  setSession(conversationId: string, sessionId: string | null) {
    const c = this.conversations.get(conversationId);
    if (c) c.sessionId = sessionId;
  }

  insertMessage(m: Omit<StoredMessage, "id" | "createdAt">) {
    const stored: StoredMessage = {
      ...m,
      id: this.id("msg"),
      createdAt: new Date(this.messages.length + 1).toISOString(),
    };
    this.messages.push(stored);
    return stored;
  }

  listMessages(conversationId: string) {
    return this.messages.filter((m) => m.conversationId === conversationId);
  }
}

/**
 * Build deps backed by the fake store, a fake analysis, a configurable share
 * set, and a MockChatProvider created once per askQuestion (one instance per
 * conversation request, as production does).
 */
function makeDeps(opts: {
  store: FakeStore;
  owner: string;
  documentId: string;
  shareWith?: string[];
  summary?: string;
  evidenceIds: string[];
  chat: MockChatProvider;
  recentCount?: number;
  openSessionCalls?: { n: number };
}): ConversationsDeps {
  const shared = new Set(opts.shareWith ?? []);
  return {
    authorize: async (userId, documentId) => {
      if (documentId !== opts.documentId) return false;
      return userId === opts.owner || shared.has(userId);
    },
    createConversation: async (userId, documentId) =>
      opts.store.createConversation(userId, documentId),
    getConversation: async (conversationId) => {
      const c = opts.store.getConversation(conversationId);
      if (!c) return null;
      return {
        userId: c.userId,
        documentId: c.documentId,
        sessionId: c.sessionId,
      };
    },
    loadAnalysis: async () => ({
      summary: opts.summary ?? "Report summary.",
      evidence: opts.evidenceIds.map((id) => ({
        id,
        excerpt: `Excerpt for ${id} about amount due and date.`,
      })),
    }),
    listMessages: async (conversationId) =>
      opts.store.listMessages(conversationId),
    insertMessage: async (m) => opts.store.insertMessage(m),
    setSession: async (conversationId, sessionId) =>
      opts.store.setSession(conversationId, sessionId),
    countRecentQuestions: async () => opts.recentCount ?? 0,
    getChat: () => {
      if (opts.openSessionCalls) opts.openSessionCalls.n += 1;
      return opts.chat;
    },
  };
}

const OWNER = "user-owner";
const DOC = "doc-1";

function answerReply(answer: string, evidenceIds: string[], notFound = false) {
  return JSON.stringify({
    answer,
    evidenceIds,
    notFoundInDocument: notFound,
  });
}

describe("openConversation", () => {
  let store: FakeStore;
  beforeEach(() => {
    store = new FakeStore();
  });

  it("creates a conversation when the user owns the document", async () => {
    const chat = new MockChatProvider();
    const deps = makeDeps({ store, owner: OWNER, documentId: DOC, evidenceIds: [], chat });
    const res = await openConversation(OWNER, DOC, deps);
    expect(res.documentId).toBe(DOC);
    expect(store.getConversation(res.conversationId)).not.toBeNull();
  });

  it("lets a share recipient open their own conversation on a shared document", async () => {
    const chat = new MockChatProvider();
    const deps = makeDeps({
      store,
      owner: OWNER,
      documentId: DOC,
      shareWith: ["recipient"],
      evidenceIds: [],
      chat,
    });
    const res = await openConversation("recipient", DOC, deps);
    const conv = store.getConversation(res.conversationId);
    expect(conv?.userId).toBe("recipient");
  });

  it("returns NOT_FOUND when the user is neither owner nor recipient", async () => {
    const chat = new MockChatProvider();
    const deps = makeDeps({ store, owner: OWNER, documentId: DOC, evidenceIds: [], chat });
    await expect(openConversation("stranger", DOC, deps)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("askQuestion", () => {
  let store: FakeStore;
  beforeEach(() => {
    store = new FakeStore();
  });

  async function openForOwner(deps: ConversationsDeps) {
    const { conversationId } = await openConversation(OWNER, DOC, deps);
    return conversationId;
  }

  it("returns the answer and only evidence IDs that exist in the analysis", async () => {
    const chat = new MockChatProvider();
    chat.respondWith(
      () => true,
      answerReply("Your amount due is 1,250.", ["e1", "e-ghost"]),
    );
    const deps = makeDeps({
      store,
      owner: OWNER,
      documentId: DOC,
      evidenceIds: ["e1", "e2"],
      chat,
    });
    const conversationId = await openForOwner(deps);

    const res = await askQuestion(OWNER, conversationId, "How much is due?", deps);
    expect(res.answer).toContain("1,250");
    expect(res.evidenceIds).toEqual(["e1"]); // e-ghost dropped
    expect(res.notFoundInDocument).toBe(false);
  });

  it("reports notFoundInDocument and keeps no invented evidence", async () => {
    const chat = new MockChatProvider();
    chat.respondWith(
      () => true,
      answerReply("", ["made-up"], true),
    );
    const deps = makeDeps({
      store,
      owner: OWNER,
      documentId: DOC,
      evidenceIds: ["e1"],
      chat,
    });
    const conversationId = await openForOwner(deps);

    const res = await askQuestion(
      OWNER,
      conversationId,
      "Who won the election?",
      deps,
    );
    expect(res.notFoundInDocument).toBe(true);
    expect(res.evidenceIds).toEqual([]);
  });

  it("stores the user question and the assistant answer in the message log", async () => {
    const chat = new MockChatProvider();
    chat.respondWith(() => true, answerReply("Answer.", ["e1"]));
    const deps = makeDeps({
      store,
      owner: OWNER,
      documentId: DOC,
      evidenceIds: ["e1"],
      chat,
    });
    const conversationId = await openForOwner(deps);

    await askQuestion(OWNER, conversationId, "A question?", deps);
    const msgs = store.listMessages(conversationId);
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(msgs[0].content).toBe("A question?");
    expect(msgs[1].evidenceIds).toEqual(["e1"]);
  });

  it("recreates a lost session once, seeded with the last 6 messages summarized", async () => {
    // Seed 8 prior messages so only the last 6 should be summarized.
    const conversationId = store.createConversation(OWNER, DOC);
    for (let i = 0; i < 8; i++) {
      store.insertMessage({
        conversationId,
        userId: OWNER,
        role: i % 2 === 0 ? "user" : "assistant",
        content: `old-${i}`,
        evidenceIds: [],
      });
    }
    store.setSession(conversationId, "dead-session");

    const seededMessages: string[] = [];
    const chat = new MockChatProvider();
    // The stored session is dead: sends on it throw, forcing one recreation.
    const originalSend = chat.send.bind(chat);
    chat.send = async (sessionId: string, message: string) => {
      if (sessionId === "dead-session") {
        throw new Error("session not found");
      }
      seededMessages.push(message);
      return originalSend(sessionId, message);
    };
    chat.respondWith((m) => m.includes("notFoundInDocument"), answerReply("Fresh.", ["e1"]));

    const openCalls = { n: 0 };
    const deps = makeDeps({
      store,
      owner: OWNER,
      documentId: DOC,
      evidenceIds: ["e1"],
      chat,
      openSessionCalls: openCalls,
    });

    const res = await askQuestion(OWNER, conversationId, "New question?", deps);
    expect(res.answer).toBe("Fresh.");
    // The seed message mentions the recent history but not the oldest ones.
    const seed = seededMessages.find((m) => m.includes("old-7"));
    expect(seed).toBeDefined();
    expect(seed).not.toContain("old-1");
    expect(seed).not.toContain("old-0");
  });

  it("rate limits after more than 30 questions in the hour", async () => {
    const chat = new MockChatProvider();
    chat.respondWith(() => true, answerReply("ok", ["e1"]));
    const deps = makeDeps({
      store,
      owner: OWNER,
      documentId: DOC,
      evidenceIds: ["e1"],
      chat,
      recentCount: 31,
    });
    const conversationId = await openForOwner(deps);
    await expect(
      askQuestion(OWNER, conversationId, "Q?", deps),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("returns NOT_FOUND when another user asks in a conversation they do not own", async () => {
    const chat = new MockChatProvider();
    chat.respondWith(() => true, answerReply("ok", ["e1"]));
    const deps = makeDeps({
      store,
      owner: OWNER,
      documentId: DOC,
      evidenceIds: ["e1"],
      chat,
    });
    const conversationId = await openForOwner(deps);
    await expect(
      askQuestion("other-user", conversationId, "Q?", deps),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

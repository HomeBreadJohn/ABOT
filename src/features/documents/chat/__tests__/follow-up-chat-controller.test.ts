import { describe, expect, it, vi } from "vitest";

import { ApiClientError } from "@/lib/api-client/client";
import { SAFE_API_MESSAGES } from "@/lib/api-client/safe-messages";
import {
  createSessionConversationStore,
  type StorageLike,
} from "@/features/documents/chat/conversation-store";
import {
  createFollowUpChatController,
  type FollowUpChatClient,
} from "@/features/documents/chat/follow-up-chat-controller";

function memoryStore() {
  const data = new Map<string, string>();
  const storage: StorageLike = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
  return createSessionConversationStore(() => storage);
}

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeClient(overrides: Partial<FollowUpChatClient> = {}) {
  const client = {
    openConversation: vi.fn(async (documentId: string) => ({
      conversationId: "conv-1",
      documentId,
    })),
    askQuestion: vi.fn(async () => ({
      messageId: "a-1",
      answer: "Pay within 30 days.",
      evidenceIds: ["ev-1"],
      notFoundInDocument: false,
    })),
    listMessages: vi.fn(async () => ({ messages: [] })),
    ...overrides,
  };
  return client satisfies FollowUpChatClient;
}

async function ready(client: FollowUpChatClient, store = memoryStore()) {
  const controller = createFollowUpChatController({
    documentId: "doc-1",
    client,
    store,
  });
  await controller.init();
  return { controller, store };
}

describe("history load and conversation reuse", () => {
  it("opens a conversation, stores its id, and starts empty", async () => {
    const client = makeClient();
    const { controller, store } = await ready(client);

    expect(client.openConversation).toHaveBeenCalledWith("doc-1");
    expect(store.get("doc-1")).toBe("conv-1");
    expect(controller.getState()).toMatchObject({
      phase: "ready",
      messages: [],
    });
  });

  it("reuses a stored conversation and loads its history", async () => {
    const client = makeClient({
      listMessages: vi.fn(async () => ({
        messages: [
          {
            id: "m1",
            role: "USER" as const,
            content: "Q?",
            createdAt: "2026-01-01T00:00:00Z",
          },
          {
            id: "m2",
            role: "ASSISTANT" as const,
            content: "A.",
            evidenceIds: ["ev-1"],
            createdAt: "2026-01-01T00:00:01Z",
          },
        ],
      })),
    });
    const store = memoryStore();
    store.set("doc-1", "conv-stored");

    const { controller } = await ready(client, store);

    expect(client.openConversation).not.toHaveBeenCalled();
    expect(client.listMessages).toHaveBeenCalledWith("conv-stored");
    expect(
      controller.getState().messages.map((m) => [m.role, m.content]),
    ).toEqual([
      ["user", "Q?"],
      ["assistant", "A."],
    ]);
  });

  it("opens a new conversation when the stored one is no longer accepted", async () => {
    const client = makeClient({
      listMessages: vi.fn(async () => {
        throw new ApiClientError("NOT_FOUND", "gone", 404);
      }),
    });
    const store = memoryStore();
    store.set("doc-1", "conv-stale");

    const { controller } = await ready(client, store);

    expect(client.openConversation).toHaveBeenCalledTimes(1);
    expect(store.get("doc-1")).toBe("conv-1");
    expect(controller.getState().phase).toBe("ready");
  });

  it("keeps the stored id and shows safe copy when loading fails, then recovers", async () => {
    const listMessages = vi
      .fn()
      .mockRejectedValueOnce(
        new ApiClientError("PROVIDER_UNAVAILABLE", "raw secret detail", 503),
      )
      .mockResolvedValue({ messages: [] });
    const client = makeClient({ listMessages });
    const store = memoryStore();
    store.set("doc-1", "conv-stored");

    const { controller } = await ready(client, store);
    expect(controller.getState()).toMatchObject({
      phase: "load-error",
      loadError: SAFE_API_MESSAGES.PROVIDER_UNAVAILABLE,
    });
    expect(store.get("doc-1")).toBe("conv-stored");

    await controller.retryLoad();
    expect(controller.getState().phase).toBe("ready");
    expect(client.openConversation).not.toHaveBeenCalled();
  });

  it("opens only one conversation when init runs twice", async () => {
    const client = makeClient();
    const controller = createFollowUpChatController({
      documentId: "doc-1",
      client,
      store: memoryStore(),
    });
    await Promise.all([controller.init(), controller.init()]);
    expect(client.openConversation).toHaveBeenCalledTimes(1);
  });
});

describe("send", () => {
  it("shows the question at once, then appends the answer with citations", async () => {
    const pending = deferred<{
      messageId: string;
      answer: string;
      evidenceIds: string[];
      notFoundInDocument: boolean;
    }>();
    const client = makeClient({ askQuestion: vi.fn(() => pending.promise) });
    const { controller } = await ready(client);

    controller.setDraft("  When is it due?  ");
    const sending = controller.send();

    expect(controller.getState()).toMatchObject({
      sending: true,
      draft: "",
      messages: [{ role: "user", content: "When is it due?" }],
    });
    expect(client.askQuestion).toHaveBeenCalledWith("conv-1", {
      content: "When is it due?",
    });

    pending.resolve({
      messageId: "a-1",
      answer: "In 30 days.",
      evidenceIds: ["ev-1"],
      notFoundInDocument: false,
    });
    await sending;

    const state = controller.getState();
    expect(state.sending).toBe(false);
    expect(state.messages).toHaveLength(2);
    expect(state.messages[1]).toMatchObject({
      id: "a-1",
      role: "assistant",
      content: "In 30 days.",
      evidenceIds: ["ev-1"],
      notFoundInDocument: false,
    });
  });

  it("flags a not-found answer and drops its citations", async () => {
    const client = makeClient({
      askQuestion: vi.fn(async () => ({
        messageId: "a-2",
        answer: "Probably the landlord.",
        evidenceIds: ["ev-1"],
        notFoundInDocument: true,
      })),
    });
    const { controller } = await ready(client);

    controller.setDraft("Who owns the car?");
    await controller.send();

    expect(controller.getState().messages[1]).toMatchObject({
      role: "assistant",
      notFoundInDocument: true,
      evidenceIds: [],
    });
  });

  it("ignores empty, whitespace, over-limit and not-ready sends", async () => {
    const client = makeClient();
    const early = createFollowUpChatController({
      documentId: "doc-1",
      client,
      store: memoryStore(),
    });
    await early.send("hello before init");
    expect(client.askQuestion).not.toHaveBeenCalled();

    const { controller } = await ready(client);
    await controller.send("   ");
    await controller.send("a".repeat(1001));
    expect(client.askQuestion).not.toHaveBeenCalled();

    await controller.send("a".repeat(1000));
    expect(client.askQuestion).toHaveBeenCalledTimes(1);
  });

  it("sends only once when called twice before the first settles", async () => {
    const pending = deferred<{
      messageId: string;
      answer: string;
      evidenceIds: string[];
      notFoundInDocument: boolean;
    }>();
    const client = makeClient({ askQuestion: vi.fn(() => pending.promise) });
    const { controller } = await ready(client);

    const first = controller.send("Question one");
    const second = controller.send("Question two");
    pending.resolve({
      messageId: "a-1",
      answer: "ok",
      evidenceIds: [],
      notFoundInDocument: false,
    });
    await Promise.all([first, second]);

    expect(client.askQuestion).toHaveBeenCalledTimes(1);
    expect(controller.getState().messages.map((m) => m.content)).toEqual([
      "Question one",
      "ok",
    ]);
  });
});

describe("error then retry", () => {
  it("keeps the typed text, shows fixed copy for 429, and retries the same message", async () => {
    const askQuestion = vi
      .fn()
      .mockRejectedValueOnce(
        new ApiClientError("RATE_LIMITED", "internal limiter detail", 429),
      )
      .mockResolvedValue({
        messageId: "a-1",
        answer: "In 30 days.",
        evidenceIds: [],
        notFoundInDocument: false,
      });
    const client = makeClient({ askQuestion });
    const { controller } = await ready(client);

    controller.setDraft("When is it due?");
    await controller.send();

    expect(controller.getState()).toMatchObject({
      sending: false,
      sendError: SAFE_API_MESSAGES.RATE_LIMITED,
      failedText: "When is it due?",
      draft: "When is it due?",
      messages: [],
    });

    await controller.retry();

    expect(askQuestion).toHaveBeenCalledTimes(2);
    expect(askQuestion.mock.calls[1][1]).toEqual({
      content: "When is it due?",
    });
    expect(controller.getState()).toMatchObject({
      sendError: null,
      failedText: null,
      draft: "",
    });
    expect(controller.getState().messages.map((m) => m.role)).toEqual([
      "user",
      "assistant",
    ]);
  });

  it("uses fixed copy for 503 and for non-API failures, never the raw message", async () => {
    const askQuestion = vi
      .fn()
      .mockRejectedValueOnce(
        new ApiClientError("PROVIDER_UNAVAILABLE", "stack: secret", 503),
      )
      .mockRejectedValueOnce(new TypeError("Failed to fetch https://internal"));
    const { controller } = await ready(makeClient({ askQuestion }));

    await controller.send("one");
    expect(controller.getState().sendError).toBe(
      SAFE_API_MESSAGES.PROVIDER_UNAVAILABLE,
    );

    await controller.retry();
    expect(controller.getState().sendError).toBe(
      SAFE_API_MESSAGES.INTERNAL_ERROR,
    );
    expect(controller.getState().sendError).not.toContain("internal");
  });

  it("does not overwrite text typed after a failure", async () => {
    const askQuestion = vi
      .fn()
      .mockRejectedValue(new ApiClientError("INTERNAL_ERROR", "x", 500));
    const { controller } = await ready(makeClient({ askQuestion }));

    controller.setDraft("first");
    const sending = controller.send();
    controller.setDraft("typed while sending");
    await sending;

    expect(controller.getState()).toMatchObject({
      draft: "typed while sending",
      failedText: "first",
    });
  });
});

describe("subscription", () => {
  it("notifies listeners and stops after unsubscribe", async () => {
    const { controller } = await ready(makeClient());
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);

    controller.setDraft("a");
    expect(listener).toHaveBeenCalledTimes(1);
    controller.setDraft("a");
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    controller.setDraft("ab");
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

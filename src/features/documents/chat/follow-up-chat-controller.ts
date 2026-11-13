/**
 * Framework-free state machine behind useFollowUpChat. Keeping it outside React
 * lets the open/reuse, history, send and retry logic run in plain unit tests
 * with a fake client. The hook only binds it to React.
 */
import {
  askQuestion,
  listMessages,
  openConversation,
} from "@/lib/api-client/conversations";
import { ApiClientError } from "@/lib/api-client/client";
import { safeMessageFor } from "@/lib/api-client/safe-messages";

import {
  fromAnswer,
  fromHistory,
  optimisticUserMessage,
  type ChatMessage,
} from "@/features/documents/chat/chat-messages";
import { MESSAGE_MAX_LENGTH } from "@/features/documents/chat/composer";
import type { ConversationIdStore } from "@/features/documents/chat/conversation-store";

/** The three API calls the chat needs. Tests inject a fake. */
export type FollowUpChatClient = {
  openConversation: typeof openConversation;
  askQuestion: typeof askQuestion;
  listMessages: typeof listMessages;
};

export const defaultFollowUpChatClient: FollowUpChatClient = {
  openConversation,
  askQuestion,
  listMessages,
};

export type FollowUpChatState = {
  phase: "loading" | "ready" | "load-error";
  messages: ChatMessage[];
  draft: string;
  sending: boolean;
  /** Fixed safe copy for the last failed send. */
  sendError: string | null;
  /** The trimmed text of the last failed send, kept for retry. */
  failedText: string | null;
  /** Fixed safe copy when the conversation could not be opened or loaded. */
  loadError: string | null;
};

export const INITIAL_CHAT_STATE: FollowUpChatState = {
  phase: "loading",
  messages: [],
  draft: "",
  sending: false,
  sendError: null,
  failedText: null,
  loadError: null,
};

export type FollowUpChatController = {
  getState(): FollowUpChatState;
  subscribe(listener: () => void): () => void;
  /** Opens or reuses the conversation and loads history. Safe to call twice. */
  init(): Promise<void>;
  /** Starts loading again after a load error. */
  retryLoad(): Promise<void>;
  setDraft(draft: string): void;
  /** Sends `text`, or the current draft when omitted. Resolves when settled. */
  send(text?: string): Promise<void>;
  /** Re-sends the last failed message. */
  retry(): Promise<void>;
};

export function createFollowUpChatController(options: {
  documentId: string;
  client: FollowUpChatClient;
  store: ConversationIdStore;
}): FollowUpChatController {
  const { documentId, client, store } = options;

  let state = INITIAL_CHAT_STATE;
  const listeners = new Set<() => void>();
  let conversationId: string | null = null;
  let initPromise: Promise<void> | null = null;
  // Synchronous guard: React state updates are async, so two quick calls
  // could otherwise both pass a state check and send twice.
  let inFlight = false;
  let localCounter = 0;

  function update(patch: Partial<FollowUpChatState>) {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  }

  /** A stored id the server no longer accepts is dropped, not surfaced. */
  function isStaleConversation(error: unknown): boolean {
    return (
      error instanceof ApiClientError &&
      (error.code === "NOT_FOUND" || error.code === "FORBIDDEN")
    );
  }

  async function load(): Promise<void> {
    const stored = store.get(documentId);
    if (stored) {
      try {
        const history = await client.listMessages(stored);
        conversationId = stored;
        update({
          phase: "ready",
          loadError: null,
          messages: history.messages.map(fromHistory),
        });
        return;
      } catch (error) {
        if (!isStaleConversation(error)) throw error;
        store.clear(documentId);
      }
    }

    const opened = await client.openConversation(documentId);
    store.set(documentId, opened.conversationId);
    conversationId = opened.conversationId;
    // A conversation opened just now has no messages to load.
    update({ phase: "ready", loadError: null, messages: [] });
  }

  function init(): Promise<void> {
    if (initPromise) return initPromise;
    update({ phase: "loading", loadError: null });
    initPromise = load().catch((error: unknown) => {
      initPromise = null;
      update({ phase: "load-error", loadError: safeMessageFor(error) });
    });
    return initPromise;
  }

  async function send(text: string = state.draft): Promise<void> {
    const trimmed = text.trim();
    if (
      inFlight ||
      state.phase !== "ready" ||
      conversationId === null ||
      trimmed === "" ||
      text.length > MESSAGE_MAX_LENGTH
    ) {
      return;
    }
    inFlight = true;

    const optimistic = optimisticUserMessage(
      `local-${(localCounter += 1)}`,
      trimmed,
    );
    update({
      sending: true,
      sendError: null,
      failedText: null,
      messages: [...state.messages, optimistic],
      // Clear the composer only when it still holds what is being sent.
      draft: state.draft.trim() === trimmed ? "" : state.draft,
    });

    try {
      const answer = await client.askQuestion(conversationId, {
        content: trimmed,
      });
      update({
        sending: false,
        messages: [...state.messages, fromAnswer(answer)],
      });
    } catch (error) {
      update({
        sending: false,
        sendError: safeMessageFor(error),
        failedText: trimmed,
        messages: state.messages.filter((m) => m.id !== optimistic.id),
        // Put the text back so nothing the user typed is lost.
        draft: state.draft === "" ? trimmed : state.draft,
      });
    } finally {
      inFlight = false;
    }
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    init,
    retryLoad: init,
    setDraft(draft) {
      if (draft !== state.draft) update({ draft });
    },
    send,
    async retry() {
      if (state.failedText !== null) await send(state.failedText);
    },
  };
}

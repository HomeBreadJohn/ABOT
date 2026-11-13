"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import {
  createSessionConversationStore,
  type ConversationIdStore,
} from "@/features/documents/chat/conversation-store";
import {
  createFollowUpChatController,
  defaultFollowUpChatClient,
  INITIAL_CHAT_STATE,
  type FollowUpChatClient,
  type FollowUpChatState,
} from "@/features/documents/chat/follow-up-chat-controller";

const defaultStore = createSessionConversationStore();

export type UseFollowUpChatOptions = {
  documentId: string;
  /** Defaults to the real API client. Tests pass a fake. */
  client?: FollowUpChatClient;
  /** Defaults to sessionStorage keyed by document id. */
  store?: ConversationIdStore;
};

export type UseFollowUpChatResult = FollowUpChatState & {
  setDraft: (draft: string) => void;
  send: (text?: string) => Promise<void>;
  retry: () => Promise<void>;
  retryLoad: () => Promise<void>;
};

/**
 * Binds the chat controller to React. `documentId`, `client` and `store` are
 * read once, so mount it with `key={documentId}` to switch documents.
 * FollowUpChat does this itself.
 */
export function useFollowUpChat({
  documentId,
  client = defaultFollowUpChatClient,
  store = defaultStore,
}: UseFollowUpChatOptions): UseFollowUpChatResult {
  const [controller] = useState(() =>
    createFollowUpChatController({ documentId, client, store }),
  );

  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getState,
    () => INITIAL_CHAT_STATE,
  );

  // init() is idempotent, so a Strict Mode remount does not open a second
  // conversation.
  useEffect(() => {
    void controller.init();
  }, [controller]);

  return {
    ...state,
    setDraft: controller.setDraft,
    send: controller.send,
    retry: controller.retry,
    retryLoad: controller.retryLoad,
  };
}

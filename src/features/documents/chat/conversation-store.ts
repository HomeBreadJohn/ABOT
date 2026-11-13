/**
 * Remembers the open conversation per document for the browser tab.
 *
 * Finding: POST /api/documents/:id/conversations is NOT idempotent. Every call
 * inserts a new conversation row (createConversation in
 * src/features/conversations/services/conversations.ts), and there is no list
 * endpoint. Opening on every mount would orphan the history, so the id is kept
 * in sessionStorage, keyed by document id, and reused.
 */
export type ConversationIdStore = {
  get(documentId: string): string | null;
  set(documentId: string, conversationId: string): void;
  clear(documentId: string): void;
};

/** The subset of the Storage interface the store uses. */
export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const KEY_PREFIX = "abot:follow-up-chat:";

function keyFor(documentId: string): string {
  return `${KEY_PREFIX}${documentId}`;
}

/** sessionStorage can be missing (server render) or throw (blocked storage). */
function defaultGetStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function createSessionConversationStore(
  getStorage: () => StorageLike | null = defaultGetStorage,
): ConversationIdStore {
  return {
    get(documentId) {
      try {
        const value = getStorage()?.getItem(keyFor(documentId));
        return value ? value : null;
      } catch {
        return null;
      }
    },
    set(documentId, conversationId) {
      try {
        getStorage()?.setItem(keyFor(documentId), conversationId);
      } catch {
        /* Storage is best-effort: without it a new conversation opens next time. */
      }
    },
    clear(documentId) {
      try {
        getStorage()?.removeItem(keyFor(documentId));
      } catch {
        /* Nothing to clean up if storage is unavailable. */
      }
    },
  };
}

/**
 * The send contract caps a message at 1,000 characters
 * (sendMessageRequestSchema). The 4,000-character provider budget also covers
 * instructions and document context, so it is not the user's limit.
 */
export const MESSAGE_MAX_LENGTH = 1000;

/** Remaining-character count at or below which the counter is announced. */
export const COUNTER_ANNOUNCE_AT = 50;

export type ComposerState = {
  length: number;
  remaining: number;
  overLimit: boolean;
  isEmpty: boolean;
  canSend: boolean;
  /** Visible counter text. Wording carries the state, not color alone. */
  counterLabel: string;
  /** Polite live-region text. Empty until the limit is close. */
  announcement: string;
};

export function composerState(text: string, sending: boolean): ComposerState {
  const length = text.length;
  const remaining = MESSAGE_MAX_LENGTH - length;
  const overLimit = remaining < 0;
  const isEmpty = text.trim().length === 0;

  const counterLabel = overLimit
    ? `${length} / ${MESSAGE_MAX_LENGTH} · ${-remaining} over the limit`
    : `${length} / ${MESSAGE_MAX_LENGTH}`;

  let announcement = "";
  if (overLimit) {
    announcement = `${-remaining} ${plural(-remaining)} over the limit. Shorten your question to send it.`;
  } else if (remaining <= COUNTER_ANNOUNCE_AT) {
    announcement = `${remaining} ${plural(remaining)} remaining.`;
  }

  return {
    length,
    remaining,
    overLimit,
    isEmpty,
    canSend: !sending && !isEmpty && !overLimit,
    counterLabel,
    announcement,
  };
}

function plural(count: number): string {
  return count === 1 ? "character" : "characters";
}

/**
 * Enter sends, Shift+Enter inserts a newline. Enter while an input method is
 * composing text (for example choosing a character) must not send.
 */
export function shouldSendOnKey(event: {
  key: string;
  shiftKey: boolean;
  isComposing?: boolean;
}): boolean {
  return event.key === "Enter" && !event.shiftKey && !event.isComposing;
}

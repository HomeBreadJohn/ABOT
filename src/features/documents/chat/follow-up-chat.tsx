"use client";

import { useEffect, useId, useRef } from "react";

import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Label } from "@/components/ui/label";
import { LoadingState } from "@/components/ui/loading-state";
import type { EvidenceReference, ExplanationLanguage } from "@/contracts";
import { buildCitations } from "@/features/documents/chat/citations";
import { NOT_IN_DOCUMENT_COPY } from "@/features/documents/chat/chat-messages";
import type { ChatMessage } from "@/features/documents/chat/chat-messages";
import {
  composerState,
  MESSAGE_MAX_LENGTH,
  shouldSendOnKey,
} from "@/features/documents/chat/composer";
import type { ConversationIdStore } from "@/features/documents/chat/conversation-store";
import type {
  FollowUpChatClient,
  FollowUpChatState,
} from "@/features/documents/chat/follow-up-chat-controller";
import { orderSuggestedPrompts } from "@/features/documents/chat/suggested-prompts";
import { useFollowUpChat } from "@/features/documents/chat/use-follow-up-chat";
import { cn } from "@/lib/utils";

export type FollowUpChatProps = {
  documentId: string;
  /** The report's evidence, used for citation labels. */
  evidence: readonly EvidenceReference[];
  /** Called with the evidence id when a citation button is pressed. */
  onOpenEvidence?: (evidenceId: string) => void;
  /** When Filipino or Taglish, the Filipino starter question comes first. */
  initialLanguageHint?: ExplanationLanguage;
  /** Injection points for tests. Default to the real API and sessionStorage. */
  client?: FollowUpChatClient;
  store?: ConversationIdStore;
};

/**
 * Follow-up chat embedded in the report. Answers come from the document only.
 * The chat only reports what the assistant said and never claims that an
 * action was taken.
 */
export function FollowUpChat({ documentId, ...rest }: FollowUpChatProps) {
  // Keyed so a different document gets a fresh conversation.
  return (
    <FollowUpChatForDocument
      key={documentId}
      documentId={documentId}
      {...rest}
    />
  );
}

function FollowUpChatForDocument({
  documentId,
  evidence,
  onOpenEvidence,
  initialLanguageHint,
  client,
  store,
}: FollowUpChatProps) {
  const chat = useFollowUpChat({ documentId, client, store });
  return (
    <FollowUpChatView
      state={chat}
      evidence={evidence}
      onOpenEvidence={onOpenEvidence}
      initialLanguageHint={initialLanguageHint}
      onDraftChange={chat.setDraft}
      onSend={() => void chat.send()}
      onRetry={() => void chat.retry()}
      onRetryLoad={() => void chat.retryLoad()}
    />
  );
}

export type FollowUpChatViewProps = {
  state: FollowUpChatState;
  evidence: readonly EvidenceReference[];
  onOpenEvidence?: (evidenceId: string) => void;
  initialLanguageHint?: ExplanationLanguage;
  onDraftChange: (draft: string) => void;
  onSend: () => void;
  onRetry: () => void;
  onRetryLoad: () => void;
};

/** Presentational half of the chat. State and actions come from the hook. */
export function FollowUpChatView({
  state,
  evidence,
  onOpenEvidence,
  initialLanguageHint,
  onDraftChange,
  onSend,
  onRetry,
  onRetryLoad,
}: FollowUpChatViewProps) {
  const headingId = useId();
  const textareaId = useId();
  const counterId = useId();
  const logRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const composer = composerState(state.draft, state.sending);
  const prompts = orderSuggestedPrompts(initialLanguageHint);

  // Scroll the log (not the page) to the newest entry.
  const messageCount = state.messages.length;
  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messageCount, state.sending, state.phase]);

  function submit() {
    if (!composer.canSend) return;
    onSend();
    // The Send button disables while sending; keep focus in the composer.
    textareaRef.current?.focus();
  }

  function pickPrompt(text: string) {
    onDraftChange(text);
    textareaRef.current?.focus();
  }

  return (
    <section aria-labelledby={headingId} className="grid gap-4">
      <header className="grid gap-1.5">
        <h2 id={headingId} className="text-ink text-lg font-semibold">
          Ask about this document
        </h2>
        <p className="text-caption text-ink-subtle max-w-prose">
          Answers come from this document only. They are not legal, financial or
          other professional advice.
        </p>
      </header>

      {state.phase === "loading" ? (
        <LoadingState label="Loading your conversation…" />
      ) : null}

      {state.phase === "load-error" ? (
        <div className="grid gap-3">
          <FormMessage variant="error">{state.loadError}</FormMessage>
          <div>
            <Button
              type="button"
              variant="secondary"
              size="lg"
              onClick={onRetryLoad}
            >
              Try again
            </Button>
          </div>
        </div>
      ) : null}

      {state.phase === "ready" ? (
        <>
          <div
            ref={logRef}
            role="log"
            aria-live="polite"
            aria-relevant="additions"
            aria-busy={state.sending}
            aria-label="Conversation"
            // Focusable so keyboard users can scroll the history.
            tabIndex={0}
            className="border-hairline bg-surface-sunken focus-visible:outline-focus grid max-h-96 min-h-24 gap-3 overflow-y-auto rounded-md border p-3.5 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {state.messages.length === 0 ? (
              <p className="text-body-sm text-ink-muted">
                No questions yet. Pick one below or write your own.
              </p>
            ) : null}
            {state.messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                evidence={evidence}
                onOpenEvidence={onOpenEvidence}
              />
            ))}
            {state.sending ? (
              <p
                role="status"
                className="text-body-sm text-ink-muted flex items-center gap-2.5"
              >
                <span
                  aria-hidden="true"
                  className="border-tone-informative-fg h-4 w-4 animate-spin rounded-full border-2 border-t-transparent"
                />
                Looking through your document…
              </p>
            ) : null}
          </div>

          {state.messages.length === 0 ? (
            <div className="grid gap-2">
              <p className="text-caption text-ink-subtle font-semibold tracking-wide uppercase">
                Suggested questions
              </p>
              <ul className="flex flex-wrap gap-2">
                {prompts.map((prompt) => (
                  <li key={prompt.id}>
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-auto min-h-11 py-2 text-left whitespace-normal"
                      onClick={() => pickPrompt(prompt.text)}
                    >
                      {prompt.text}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {state.sendError ? (
            <div className="grid gap-3">
              <FormMessage variant="error">{state.sendError}</FormMessage>
              {state.failedText !== null ? (
                <div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="lg"
                    disabled={state.sending}
                    onClick={onRetry}
                  >
                    Retry sending
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          <form
            className="grid gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <Label htmlFor={textareaId}>Your question</Label>
            <textarea
              ref={textareaRef}
              id={textareaId}
              name="question"
              rows={3}
              value={state.draft}
              aria-describedby={counterId}
              aria-invalid={composer.overLimit}
              placeholder="Ask about something in this document"
              className="border-ink-200 bg-surface text-ink-950 placeholder:text-ink-400 focus:border-brand-500 focus:ring-brand-500/30 min-h-24 w-full resize-y rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
              onChange={(event) => onDraftChange(event.target.value)}
              onKeyDown={(event) => {
                if (
                  shouldSendOnKey({
                    key: event.key,
                    shiftKey: event.shiftKey,
                    isComposing: event.nativeEvent.isComposing,
                  })
                ) {
                  event.preventDefault();
                  submit();
                }
              }}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p
                id={counterId}
                className={cn(
                  "text-caption tabular-nums",
                  composer.overLimit
                    ? "text-tone-critical-fg font-semibold"
                    : "text-ink-subtle",
                )}
              >
                {composer.counterLabel}
                <span className="sr-only">
                  {" "}
                  characters. Limit {MESSAGE_MAX_LENGTH}.
                </span>
              </p>
              <Button type="submit" size="lg" disabled={!composer.canSend}>
                {state.sending ? "Sending…" : "Send"}
              </Button>
            </div>
            {/* Announces only when the limit is close, not on every key. */}
            <p className="sr-only" role="status" aria-live="polite">
              {composer.announcement}
            </p>
          </form>
        </>
      ) : null}
    </section>
  );
}

function MessageBubble({
  message,
  evidence,
  onOpenEvidence,
}: {
  message: ChatMessage;
  evidence: readonly EvidenceReference[];
  onOpenEvidence?: (evidenceId: string) => void;
}) {
  const isUser = message.role === "user";
  const citations = buildCitations(message.evidenceIds, evidence);

  return (
    <article
      className={cn(
        "max-w-prose rounded-md border px-3.5 py-2.5",
        isUser
          ? "border-tone-informative-border bg-tone-informative-bg ml-auto"
          : "border-hairline bg-surface",
      )}
    >
      <p className="text-caption text-ink-subtle font-semibold tracking-wide uppercase">
        {isUser ? "You" : "Answer"}
      </p>
      {message.notFoundInDocument ? (
        <p className="text-body-sm text-ink mt-1 font-medium">
          {NOT_IN_DOCUMENT_COPY}
        </p>
      ) : (
        // Plain text only. React escapes it, so model output cannot inject HTML.
        <p className="text-body-sm text-ink mt-1 leading-relaxed whitespace-pre-wrap">
          {message.content}
        </p>
      )}
      {citations.length > 0 ? (
        <ul className="mt-2.5 flex flex-wrap gap-2" aria-label="Sources">
          {citations.map((citation) => (
            <li key={citation.evidenceId}>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="min-h-11"
                aria-label={citation.description}
                disabled={!onOpenEvidence}
                onClick={() => onOpenEvidence?.(citation.evidenceId)}
              >
                {citation.label}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { EvidenceReference } from "@/contracts";
import {
  FollowUpChatView,
  type FollowUpChatViewProps,
} from "@/features/documents/chat/follow-up-chat";
import {
  INITIAL_CHAT_STATE,
  type FollowUpChatState,
} from "@/features/documents/chat/follow-up-chat-controller";

const evidence: EvidenceReference[] = [
  {
    id: "ev-1",
    documentId: "doc-1",
    pageNumber: 3,
    excerpt: "Pay within 30 days.",
    sourceType: "OCR_TEXT",
  },
];

function render(
  state: Partial<FollowUpChatState>,
  props: Partial<FollowUpChatViewProps> = {},
): string {
  return renderToStaticMarkup(
    <FollowUpChatView
      state={{ ...INITIAL_CHAT_STATE, phase: "ready", ...state }}
      evidence={evidence}
      onDraftChange={vi.fn()}
      onSend={vi.fn()}
      onRetry={vi.fn()}
      onRetryLoad={vi.fn()}
      {...props}
    />,
  );
}

describe("FollowUpChatView", () => {
  it("shows suggested prompts, the scope note, and a labeled composer when history is empty", () => {
    const html = render({});
    expect(html).toContain("Explain this in simpler terms.");
    expect(html).toContain("Explain this in Filipino.");
    expect(html).toContain("Answers come from this document only");
    expect(html).toContain("not legal, financial");
    expect(html).toContain('role="log"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("Your question");
    expect(html).toContain("0 / 1000");
  });

  it("hides suggested prompts once there are messages", () => {
    const html = render({
      messages: [
        {
          id: "m1",
          role: "user",
          content: "Hi",
          evidenceIds: [],
          notFoundInDocument: false,
        },
      ],
    });
    expect(html).not.toContain("Suggested questions");
  });

  it("renders assistant text as escaped plain text", () => {
    const html = render({
      messages: [
        {
          id: "m1",
          role: "assistant",
          content: '<img src=x onerror="alert(1)"><script>x</script>',
          evidenceIds: [],
          notFoundInDocument: false,
        },
      ],
    });
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;img");
  });

  it("renders citations as buttons and the honest not-found copy without the guess", () => {
    const html = render(
      {
        messages: [
          {
            id: "a1",
            role: "assistant",
            content: "Pay in 30 days.",
            evidenceIds: ["ev-1"],
            notFoundInDocument: false,
          },
          {
            id: "a2",
            role: "assistant",
            content: "Probably the landlord.",
            evidenceIds: [],
            notFoundInDocument: true,
          },
        ],
      },
      { onOpenEvidence: vi.fn() },
    );
    expect(html).toContain("Source 1 · Page 3");
    expect(html).toContain("<button");
    expect(html).toContain("This isn&#x27;t in your document");
    expect(html).not.toContain("Probably the landlord.");
  });

  /** The submit button's opening tag. Class names also contain "disabled:". */
  function submitTag(html: string): string {
    const match = /<button[^>]*type="submit"[^>]*>/.exec(html);
    if (!match) throw new Error("submit button not found");
    return match[0];
  }
  const isDisabled = (html: string) =>
    / disabled(=""| |>)/.test(submitTag(html));

  it("disables Send when empty and when sending", () => {
    expect(isDisabled(render({ draft: "" }))).toBe(true);
    const sending = render({ draft: "hello", sending: true });
    expect(isDisabled(sending)).toBe(true);
    expect(sending).toContain("Sending…");
    expect(sending).toContain("Looking through your document…");
  });

  it("enables Send for a valid draft and blocks it over the limit", () => {
    expect(isDisabled(render({ draft: "hello" }))).toBe(false);
    const over = render({ draft: "a".repeat(1001) });
    expect(isDisabled(over)).toBe(true);
    expect(over).toContain("1 over the limit");
    expect(over).toContain('aria-invalid="true"');
  });

  it("shows fixed error copy with a retry button, keeping the draft in the composer", () => {
    const html = render({
      draft: "When is it due?",
      sendError:
        "You're doing that too often. Please wait a moment and try again.",
      failedText: "When is it due?",
    });
    expect(html).toContain('role="alert"');
    expect(html).toContain("Retry sending");
    expect(html).toContain("When is it due?");
  });

  it("shows loading and load-error phases", () => {
    expect(render({ phase: "loading" })).toContain("Loading your conversation");
    const failed = render({ phase: "load-error", loadError: "Try later." });
    expect(failed).toContain("Try later.");
    expect(failed).toContain("Try again");
    expect(failed).not.toContain('role="log"');
  });

  it("puts the Filipino question first for a Filipino language hint", () => {
    const html = render({}, { initialLanguageHint: "FIL" });
    expect(html.indexOf("Explain this in Filipino.")).toBeLessThan(
      html.indexOf("Explain this in simpler terms."),
    );
  });

  it("never uses language that claims an action was taken", () => {
    const html = render({});
    expect(html).not.toMatch(/I['’]ve (submitted|booked|paid|sent|filed)/i);
  });
});

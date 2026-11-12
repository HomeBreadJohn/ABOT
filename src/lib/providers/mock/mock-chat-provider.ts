import {
  CHAT_MESSAGE_MAX_LENGTH,
  type ChatProvider,
} from "@/lib/providers/chat-provider";

type Rule = { matcher: (message: string) => boolean; reply: string };

/**
 * Deterministic chat provider for tests. `respondWith` queues matcher→reply
 * rules; `send` returns the first matching reply, or a default acknowledgement.
 */
export class MockChatProvider implements ChatProvider {
  private readonly rules: Rule[] = [];

  respondWith(matcher: (message: string) => boolean, reply: string): void {
    this.rules.push({ matcher, reply });
  }

  async openSession(): Promise<{ sessionId: string; instanceId: string }> {
    return { sessionId: "mock-session", instanceId: "mock-instance" };
  }

  async send(_sessionId: string, message: string): Promise<{ reply: string }> {
    if (message.length > CHAT_MESSAGE_MAX_LENGTH) {
      throw new Error(
        `Chat message exceeds ${CHAT_MESSAGE_MAX_LENGTH} characters.`,
      );
    }
    const rule = this.rules.find((r) => r.matcher(message));
    return { reply: rule ? rule.reply : "OK" };
  }
}

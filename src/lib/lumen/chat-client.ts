import "server-only";

import { getProviderEnv } from "@/lib/env/server";
import { lumenRequest, type LumenTransport } from "@/lib/lumen/http";
import {
  chatAnswerSchema,
  chatInstancesSchema,
  chatSessionSchema,
} from "@/lib/lumen/chat-schemas";
import {
  CHAT_MESSAGE_MAX_LENGTH,
  type ChatProvider,
} from "@/lib/providers/chat-provider";

/**
 * ChatProvider backed by the Lumen AI Chat API. The transport is injected so
 * unit tests run against fakes with zero network calls. The message route needs
 * both the instance and session ids, so `openSession` remembers the instance id
 * for the `send` that follows.
 */
export class LumenChatProvider implements ChatProvider {
  private instanceId?: string;

  constructor(private readonly transport?: LumenTransport) {}

  async openSession(): Promise<{ sessionId: string; instanceId: string }> {
    const instanceId = await this.resolveInstanceId();
    const session = await lumenRequest({
      base: "ai_chat",
      path: `/instances/${instanceId}/sessions`,
      method: "POST",
      body: {},
      schema: chatSessionSchema,
      operation: "ai_session",
      unwrapEnvelope: false,
      transport: this.transport,
    });
    this.instanceId = instanceId;
    return { sessionId: session.Session.id, instanceId };
  }

  async send(sessionId: string, message: string): Promise<{ reply: string }> {
    if (message.length > CHAT_MESSAGE_MAX_LENGTH) {
      throw new Error(
        `Chat message exceeds ${CHAT_MESSAGE_MAX_LENGTH} characters.`,
      );
    }
    if (!this.instanceId) {
      throw new Error("send requires a session opened by openSession first.");
    }
    const result = await lumenRequest({
      base: "ai_chat",
      path: `/instances/${this.instanceId}/sessions/${sessionId}/messages`,
      method: "POST",
      body: { message },
      schema: chatAnswerSchema,
      operation: "ai_message",
      unwrapEnvelope: false,
      transport: this.transport,
    });
    return { reply: result.Answer.answer };
  }

  /** Env instance id wins; otherwise list instances and pick the first. */
  private async resolveInstanceId(): Promise<string> {
    const env = getProviderEnv();
    if (env.mode === "lumen" && env.aiInstanceId) return env.aiInstanceId;

    const { Instances } = await lumenRequest({
      base: "ai_chat",
      path: "/instances",
      method: "GET",
      schema: chatInstancesSchema,
      operation: "ai_instances",
      unwrapEnvelope: false,
      transport: this.transport,
    });
    const instance = Instances[0];
    if (!instance) {
      throw new Error("No AI Chat instances are configured for this key.");
    }
    return instance.InstanceID;
  }
}

export const CHAT_MESSAGE_MAX_LENGTH = 4000;

export interface ChatProvider {
  openSession(): Promise<{ sessionId: string; instanceId: string }>;
  /** message.length must be <= CHAT_MESSAGE_MAX_LENGTH. */
  send(sessionId: string, message: string): Promise<{ reply: string }>;
}

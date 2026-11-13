// The live Lumen AI Chat gateway rejects messages at ~2000 chars with
// AI_CHAT_QUERY_TOO_LONG (the documented 4000 is wrong; binary-searched: 2000
// returns 200, 2016 returns 400). 1900 leaves a ~100-char margin; content is
// mostly ASCII so byte length ~= string length.
export const CHAT_MESSAGE_MAX_LENGTH = 1900;

export interface ChatProvider {
  openSession(): Promise<{ sessionId: string; instanceId: string }>;
  /** message.length must be <= CHAT_MESSAGE_MAX_LENGTH. */
  send(sessionId: string, message: string): Promise<{ reply: string }>;
}

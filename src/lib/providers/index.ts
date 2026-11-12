import { getProviderEnv } from "@/lib/env/server";
import type { ChatProvider } from "@/lib/providers/chat-provider";
import type { OcrProvider } from "@/lib/providers/ocr-provider";
import { MockChatProvider } from "@/lib/providers/mock/mock-chat-provider";
import { MockOcrProvider } from "@/lib/providers/mock/mock-ocr-provider";

export type { OcrProvider, NormalizedPage } from "@/lib/providers/ocr-provider";
export type { ChatProvider } from "@/lib/providers/chat-provider";
export { MockOcrProvider } from "@/lib/providers/mock/mock-ocr-provider";
export { MockChatProvider } from "@/lib/providers/mock/mock-chat-provider";

const LUMEN_NOT_IMPLEMENTED =
  "Lumen providers are not implemented until Phase 3/4 (tasks B9/B12).";

export function getOcrProvider(): OcrProvider {
  if (getProviderEnv().mode === "mock") return new MockOcrProvider();
  throw new Error(LUMEN_NOT_IMPLEMENTED);
}

export function getChatProvider(): ChatProvider {
  if (getProviderEnv().mode === "mock") return new MockChatProvider();
  throw new Error(LUMEN_NOT_IMPLEMENTED);
}

import { getProviderEnv } from "@/lib/env/server";
import type { ChatProvider } from "@/lib/providers/chat-provider";
import type { OcrProvider } from "@/lib/providers/ocr-provider";
import { MockChatProvider } from "@/lib/providers/mock/mock-chat-provider";
import { MockOcrProvider } from "@/lib/providers/mock/mock-ocr-provider";
import { LumenOcrProvider } from "@/lib/lumen/ocr-client";
import { LumenChatProvider } from "@/lib/lumen/chat-client";

export type { OcrProvider, NormalizedPage } from "@/lib/providers/ocr-provider";
export type { ChatProvider } from "@/lib/providers/chat-provider";
export { MockOcrProvider } from "@/lib/providers/mock/mock-ocr-provider";
export { MockChatProvider } from "@/lib/providers/mock/mock-chat-provider";

export function getOcrProvider(): OcrProvider {
  if (getProviderEnv().mode === "mock") return new MockOcrProvider();
  return new LumenOcrProvider();
}

export function getChatProvider(): ChatProvider {
  if (getProviderEnv().mode === "mock") return new MockChatProvider();
  return new LumenChatProvider();
}

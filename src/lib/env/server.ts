import "server-only";

import { z } from "zod";

import { getPublicEnv } from "@/lib/env/public";

const serverOnlyEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

export type ProviderEnv =
  | { mode: "mock" }
  | {
      mode: "lumen";
      apiKey: string;
      apiSecret: string;
      ocrBaseUrl: string;
      aiChatBaseUrl: string;
      aiInstanceId?: string;
    };

/** Reads a required env var; errors name the variable, never its value. */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}.`);
  return value;
}

function requireHttpsEnv(name: string): string {
  const value = requireEnv(name);
  if (!value.startsWith("https://")) {
    throw new Error(`${name} must be an https URL.`);
  }
  return value;
}

/**
 * Provider selection for the document pipeline. In mock mode no credentials
 * are needed; in lumen mode every credential and endpoint is required.
 */
export function getProviderEnv(): ProviderEnv {
  const mode = process.env.PROVIDER_MODE ?? "mock";
  if (mode === "mock") return { mode: "mock" };
  if (mode !== "lumen") {
    throw new Error('PROVIDER_MODE must be "mock" or "lumen".');
  }

  const aiInstanceId = process.env.LUMEN_AI_INSTANCE_ID || undefined;
  return {
    mode: "lumen",
    apiKey: requireEnv("LUMEN_API_KEY"),
    apiSecret: requireEnv("LUMEN_API_SECRET"),
    ocrBaseUrl: requireHttpsEnv("LUMEN_OCR_BASE_URL"),
    aiChatBaseUrl: requireHttpsEnv("LUMEN_AI_CHAT_BASE_URL"),
    aiInstanceId,
  };
}

/** Secret the background job tick route compares against. */
export function getJobRunnerSecret(): string {
  return requireEnv("JOB_RUNNER_SECRET");
}

export function getServerEnv() {
  return {
    ...getPublicEnv(),
    ...serverOnlyEnvSchema.parse({
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    }),
  };
}

import { afterEach, describe, expect, it } from "vitest";

import { getJobRunnerSecret, getProviderEnv } from "@/lib/env/server";

const ENV_KEYS = [
  "PROVIDER_MODE",
  "LUMEN_API_KEY",
  "LUMEN_API_SECRET",
  "LUMEN_OCR_BASE_URL",
  "LUMEN_AI_CHAT_BASE_URL",
  "LUMEN_AI_INSTANCE_ID",
  "JOB_RUNNER_SECRET",
] as const;

const SAVED_ENV: Record<string, string | undefined> = {};
for (const key of ENV_KEYS) SAVED_ENV[key] = process.env[key];

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (SAVED_ENV[key] === undefined) delete process.env[key];
    else process.env[key] = SAVED_ENV[key];
  }
});

function setLumenEnv() {
  process.env.PROVIDER_MODE = "lumen";
  process.env.LUMEN_API_KEY = "fake-key-for-test";
  process.env.LUMEN_API_SECRET = "fake-secret-for-test";
  process.env.LUMEN_OCR_BASE_URL =
    "https://api.staging.nonlive.lumen.bayanichain.tech/ocr";
  process.env.LUMEN_AI_CHAT_BASE_URL =
    "https://api.staging.nonlive.lumen.bayanichain.tech/ai_chat";
}

describe("getProviderEnv", () => {
  it("defaults to mock when PROVIDER_MODE is unset", () => {
    delete process.env.PROVIDER_MODE;
    expect(getProviderEnv()).toEqual({ mode: "mock" });
  });

  it("returns the lumen settings in lumen mode", () => {
    setLumenEnv();
    expect(getProviderEnv()).toEqual({
      mode: "lumen",
      apiKey: "fake-key-for-test",
      apiSecret: "fake-secret-for-test",
      ocrBaseUrl: "https://api.staging.nonlive.lumen.bayanichain.tech/ocr",
      aiChatBaseUrl: "https://api.staging.nonlive.lumen.bayanichain.tech/ai_chat",
    });
  });

  it("in lumen mode a missing variable throws naming it, without leaking values", () => {
    setLumenEnv();
    delete process.env.LUMEN_API_SECRET;

    expect(() => getProviderEnv()).toThrow(/LUMEN_API_SECRET/);
    const message = (() => {
      try {
        getProviderEnv();
      } catch (error) {
        return (error as Error).message;
      }
    })() as string;
    expect(message).not.toContain("fake-key-for-test");
    expect(message).not.toContain("bayanichain");
  });

  it("in lumen mode a non-https base URL fails", () => {
    setLumenEnv();
    process.env.LUMEN_OCR_BASE_URL =
      "http://api.staging.nonlive.lumen.bayanichain.tech/ocr";

    expect(() => getProviderEnv()).toThrow(/LUMEN_OCR_BASE_URL/);
  });
});

describe("getJobRunnerSecret", () => {
  it("returns the configured secret", () => {
    process.env.JOB_RUNNER_SECRET = "fake-runner-secret";
    expect(getJobRunnerSecret()).toBe("fake-runner-secret");
  });

  it("throws naming the missing variable", () => {
    delete process.env.JOB_RUNNER_SECRET;
    expect(() => getJobRunnerSecret()).toThrow(/JOB_RUNNER_SECRET/);
  });
});

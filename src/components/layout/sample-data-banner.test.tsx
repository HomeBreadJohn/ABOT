import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SampleDataBanner } from "@/components/layout/sample-data-banner";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("SampleDataBanner", () => {
  it("shows honest sample-data copy when PROVIDER_MODE is mock", () => {
    vi.stubEnv("PROVIDER_MODE", "mock");

    const html = renderToStaticMarkup(<SampleDataBanner />);

    expect(html).toContain('role="note"');
    expect(html).toContain("analysed with sample data");
  });

  it("treats an unset PROVIDER_MODE as mock", () => {
    vi.stubEnv("PROVIDER_MODE", undefined);

    expect(renderToStaticMarkup(<SampleDataBanner />)).toContain(
      "analysed with sample data",
    );
  });

  it("renders nothing for lumen mode", () => {
    vi.stubEnv("PROVIDER_MODE", "lumen");
    vi.stubEnv("LUMEN_API_KEY", "key");
    vi.stubEnv("LUMEN_API_SECRET", "secret");
    vi.stubEnv("LUMEN_OCR_BASE_URL", "https://ocr.example.test");
    vi.stubEnv("LUMEN_AI_CHAT_BASE_URL", "https://chat.example.test");

    expect(renderToStaticMarkup(<SampleDataBanner />)).toBe("");
  });

  it("renders nothing when the provider env is invalid", () => {
    vi.stubEnv("PROVIDER_MODE", "something-else");

    expect(renderToStaticMarkup(<SampleDataBanner />)).toBe("");
  });
});

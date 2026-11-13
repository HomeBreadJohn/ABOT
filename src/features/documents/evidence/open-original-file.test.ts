import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getDocumentSignedUrl,
  isSafeOpenUrl,
  openOriginalFile,
  type OpenedTab,
} from "@/features/documents/evidence/open-original-file";

function fakeTab(): OpenedTab & { closed: boolean } {
  return {
    opener: "parent",
    location: { href: "about:blank" },
    closed: false,
    close() {
      this.closed = true;
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isSafeOpenUrl", () => {
  it("allows http and https only", () => {
    expect(
      isSafeOpenUrl("https://example.supabase.co/object/sign/x?token=1"),
    ).toBe(true);
    expect(isSafeOpenUrl("http://127.0.0.1:54321/object/sign/x")).toBe(true);
    expect(isSafeOpenUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeOpenUrl("data:text/html,hi")).toBe(false);
    expect(isSafeOpenUrl("not a url")).toBe(false);
  });
});

describe("getDocumentSignedUrl", () => {
  it("calls the signed-url route and validates the response shape", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ signedUrl: "https://example.test/f", expiresIn: 60 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getDocumentSignedUrl("doc-1")).resolves.toEqual({
      signedUrl: "https://example.test/f",
      expiresIn: 60,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/documents/doc-1/signed-url",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("rejects a response without a signedUrl", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ expiresIn: 60 })),
    );
    await expect(getDocumentSignedUrl("doc-1")).rejects.toThrow();
  });
});

describe("openOriginalFile", () => {
  it("opens a tab synchronously, clears its opener, then points it at the URL", async () => {
    const tab = fakeTab();
    const openTab = vi.fn(() => tab);
    const fetchSignedUrl = vi.fn(async () => ({
      signedUrl: "https://example.test/file.pdf",
      expiresIn: 60,
    }));

    const outcome = await openOriginalFile("doc-1", {
      fetchSignedUrl,
      openTab,
    });

    expect(outcome).toBe("opened");
    expect(openTab).toHaveBeenCalledTimes(1);
    expect(openTab).toHaveBeenCalledWith("", "_blank");
    expect(tab.opener).toBeNull();
    expect(tab.location.href).toBe("https://example.test/file.pdf");
    expect(fetchSignedUrl).toHaveBeenCalledWith("doc-1");
  });

  it("closes the blank tab and rethrows when the fetch fails", async () => {
    const tab = fakeTab();
    const failure = new Error("boom");
    await expect(
      openOriginalFile("doc-1", {
        fetchSignedUrl: async () => {
          throw failure;
        },
        openTab: () => tab,
      }),
    ).rejects.toBe(failure);
    expect(tab.closed).toBe(true);
  });

  it("refuses an unsafe URL and closes the tab", async () => {
    const tab = fakeTab();
    await expect(
      openOriginalFile("doc-1", {
        fetchSignedUrl: async () => ({
          signedUrl: "javascript:alert(1)",
          expiresIn: 60,
        }),
        openTab: () => tab,
      }),
    ).rejects.toThrow();
    expect(tab.closed).toBe(true);
    expect(tab.location.href).toBe("about:blank");
  });

  it("retries once with the real URL when the first open was blocked", async () => {
    const retryTab = fakeTab();
    const openTab = vi
      .fn<(url: string, target: string) => OpenedTab | null>()
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(retryTab);
    const outcome = await openOriginalFile("doc-1", {
      fetchSignedUrl: async () => ({
        signedUrl: "https://example.test/f",
        expiresIn: 60,
      }),
      openTab,
    });
    expect(outcome).toBe("opened");
    expect(openTab).toHaveBeenLastCalledWith(
      "https://example.test/f",
      "_blank",
    );
    expect(retryTab.opener).toBeNull();
  });

  it("reports blocked when no tab can be opened at all", async () => {
    const outcome = await openOriginalFile("doc-1", {
      fetchSignedUrl: async () => ({
        signedUrl: "https://example.test/f",
        expiresIn: 60,
      }),
      openTab: () => null,
    });
    expect(outcome).toBe("blocked");
  });
});

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  parseSidebarState,
  serializeSidebarStateCookie,
} from "@/components/layout/sidebar-state";

const layoutDirectory = dirname(fileURLToPath(import.meta.url));
const sourceRoot = resolve(layoutDirectory, "../..");

function readSource(relativePath: string) {
  return readFileSync(join(sourceRoot, relativePath), "utf8");
}

describe("dashboard shell markup", () => {
  it("keeps one main landmark and the skip-link target", () => {
    const shell = readSource("components/layout/dashboard-shell.tsx");

    expect(shell.match(/<main\b/g)).toHaveLength(1);
    expect(shell).toContain("<SkipLink />");
    expect(shell).toContain('id="main-content"');
    expect(shell).toContain("dataSource?: DocumentsDataSource");
  });

  it("keeps accessible primary and recent navigation labels", () => {
    const sidebar = readSource("components/layout/sidebar.tsx");
    const recentNavigation = readSource(
      "components/layout/recent-documents-nav.tsx",
    );

    expect(sidebar).toContain('aria-label="Primary navigation"');
    expect(recentNavigation).toContain('aria-label="Recent documents"');
    expect(recentNavigation).toContain("View all documents");
  });

  it("keeps the mobile drawer trigger and close behavior accessible", () => {
    const mobileNavigation = readSource("components/layout/mobile-nav.tsx");

    expect(mobileNavigation).toContain("aria-expanded={open}");
    expect(mobileNavigation).toContain(
      "aria-controls={mobileNavigationDialogId}",
    );
    expect(mobileNavigation).toContain("onCancel=");
    expect(mobileNavigation).toContain("closeNavigation");
  });

  it("shows the fixed mock-source notice only for mock data", () => {
    const banner = readSource("components/layout/sample-data-banner.tsx");

    expect(banner).toContain('source !== "mock"');
    expect(banner).toContain("You're viewing sample documents.");
    expect(banner).toContain('data-source="mock"');
    expect(banner).toContain("Mock source");
  });
});

describe("sidebar_state cookie", () => {
  it("defaults missing and unknown values to expanded", () => {
    expect(parseSidebarState(undefined)).toBe("expanded");
    expect(parseSidebarState("unexpected")).toBe("expanded");
    expect(parseSidebarState("collapsed")).toBe("collapsed");
  });

  it("persists only the documented state and cookie attributes", () => {
    expect(serializeSidebarStateCookie("collapsed")).toBe(
      "sidebar_state=collapsed; Max-Age=31536000; Path=/; SameSite=Lax",
    );
  });
});

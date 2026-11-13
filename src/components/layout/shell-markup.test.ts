import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const layoutDirectory = dirname(fileURLToPath(import.meta.url));
const sourceRoot = resolve(layoutDirectory, "../..");

function readSource(relativePath: string) {
  return readFileSync(join(sourceRoot, relativePath), "utf8");
}

describe("dashboard shell accessibility", () => {
  it("exposes exactly one main landmark targeted by a skip link", () => {
    const shell = readSource("components/layout/dashboard-shell.tsx");

    // One main landmark, so the skip link has a single, unambiguous target.
    expect(shell.match(/<main\b/g)).toHaveLength(1);
    expect(shell).toContain('id="main-content"');

    // A skip link that points at that main landmark and is reachable by keyboard.
    expect(shell).toContain('href="#main-content"');
    expect(shell).toContain("Skip to main content");
  });

  it("labels the primary navigation for assistive technology", () => {
    const sidebar = readSource("components/layout/sidebar.tsx");

    expect(sidebar).toContain('aria-label="Primary navigation"');
  });

  it("makes the mobile drawer trigger and dismissal accessible", () => {
    const mobileNavigation = readSource("components/layout/mobile-nav.tsx");

    // Trigger announces its state and owns the drawer it controls.
    expect(mobileNavigation).toContain("aria-expanded={open}");
    expect(mobileNavigation).toContain("aria-controls={MOBILE_NAV_DRAWER_ID}");
    expect(mobileNavigation).toContain("id={MOBILE_NAV_DRAWER_ID}");

    // The drawer is a dismissible modal dialog.
    expect(mobileNavigation).toContain('role="dialog"');
    expect(mobileNavigation).toContain('aria-modal="true"');

    // Escape closes the drawer and focus returns to the trigger.
    expect(mobileNavigation).toContain('event.key === "Escape"');
    expect(mobileNavigation).toContain("closeNavigation()");
    expect(mobileNavigation).toContain("triggerRef.current?.focus()");
  });
});

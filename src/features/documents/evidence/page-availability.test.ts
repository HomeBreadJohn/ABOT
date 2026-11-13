import { describe, expect, it } from "vitest";

import {
  isPageUnavailable,
  isPageUnreadable,
  nextPage,
  previousPage,
} from "@/features/documents/evidence/page-availability";

describe("page availability", () => {
  it("flags pages listed as unavailable", () => {
    expect(isPageUnavailable(2, [2, 5])).toBe(true);
    expect(isPageUnavailable(3, [2, 5])).toBe(false);
  });

  it("treats a missing or empty list as all pages available", () => {
    expect(isPageUnavailable(1, undefined)).toBe(false);
    expect(isPageUnavailable(1, [])).toBe(false);
  });

  it("treats a FAILED page as unreadable even when not listed", () => {
    expect(isPageUnreadable(1, [], "FAILED")).toBe(true);
    expect(isPageUnreadable(1, [], "READY")).toBe(false);
    expect(isPageUnreadable(4, [4], "READY")).toBe(true);
    expect(isPageUnreadable(1, undefined)).toBe(false);
  });
});

describe("page navigation bounds", () => {
  it("has no previous page before page 1", () => {
    expect(previousPage(1)).toBeNull();
    expect(previousPage(3)).toBe(2);
  });

  it("stops at the last page when the count is known", () => {
    expect(nextPage(3, 3)).toBeNull();
    expect(nextPage(2, 3)).toBe(3);
  });

  it("always offers a next page when the count is unknown", () => {
    expect(nextPage(7)).toBe(8);
  });
});

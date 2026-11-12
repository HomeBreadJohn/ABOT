import { describe, expect, it } from "vitest";

import { documentCategorySchema } from "@/contracts/common";
import {
  getModule,
  modulesDiffer,
} from "@/features/intelligence/modules/registry";

describe("category module registry", () => {
  it("has a module for every document category", () => {
    for (const category of documentCategorySchema.options) {
      const mod = getModule(category);
      expect(mod.category).toBe(category);
      expect(mod.moduleIds.length).toBeGreaterThan(0);
      expect(mod.promptGuidance.length).toBeGreaterThan(0);
    }
  });

  it("gives utilities a billing-breakdown specialized section (product.md 4.2)", () => {
    const titles = getModule("UTILITIES").specializedSections.map((s) =>
      s.title.toLowerCase(),
    );
    expect(titles.some((t) => t.includes("billing"))).toBe(true);
  });

  it("gives financial interest and fees sections (product.md 4.2)", () => {
    const titles = getModule("FINANCIAL").specializedSections.map((s) =>
      s.title.toLowerCase(),
    );
    expect(titles.some((t) => t.includes("interest"))).toBe(true);
    expect(titles.some((t) => t.includes("fee"))).toBe(true);
  });

  it("gives employment compensation/benefits/working conditions/termination (product.md 4.2)", () => {
    const titles = getModule("EMPLOYMENT").specializedSections.map((s) =>
      s.title.toLowerCase(),
    );
    expect(titles.some((t) => t.includes("compensation"))).toBe(true);
    expect(titles.some((t) => t.includes("benefit"))).toBe(true);
    expect(titles.some((t) => t.includes("working condition"))).toBe(true);
    expect(titles.some((t) => t.includes("termination"))).toBe(true);
  });

  it("gives government eligibility/requirements/application (product.md 4.2)", () => {
    const titles = getModule("GOVERNMENT").specializedSections.map((s) =>
      s.title.toLowerCase(),
    );
    expect(titles.some((t) => t.includes("eligibility"))).toBe(true);
    expect(titles.some((t) => t.includes("requirement"))).toBe(true);
    expect(titles.some((t) => t.includes("application"))).toBe(true);
  });

  it("gives every specialized section a non-empty id and guidance", () => {
    for (const category of documentCategorySchema.options) {
      for (const section of getModule(category).specializedSections) {
        expect(section.id.length).toBeGreaterThan(0);
        expect(section.guidance.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("modulesDiffer", () => {
  it("is false for the same category", () => {
    expect(modulesDiffer("FINANCIAL", "FINANCIAL")).toBe(false);
  });

  it("is true when two categories have different module sets", () => {
    expect(modulesDiffer("FINANCIAL", "EMPLOYMENT")).toBe(true);
  });

  it("ignores ordering and duplicates, comparing the sets", () => {
    // UTILITIES differs from GOVERNMENT by its module set.
    expect(modulesDiffer("UTILITIES", "GOVERNMENT")).toBe(true);
  });
});

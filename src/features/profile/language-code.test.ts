import { describe, expect, it } from "vitest";

import { explanationLanguageSchema } from "@/contracts";
import {
  fromApiLanguage,
  toApiLanguage,
} from "@/features/profile/language-code";
import { PREFERRED_LANGUAGE_VALUES } from "@/features/profile/types";

describe("language-code", () => {
  it("maps every stored value to its API value", () => {
    expect(toApiLanguage("en")).toBe("EN");
    expect(toApiLanguage("fil")).toBe("FIL");
    expect(toApiLanguage("taglish")).toBe("TAGLISH");
  });

  it("maps every API value to its stored value", () => {
    expect(fromApiLanguage("EN")).toBe("en");
    expect(fromApiLanguage("FIL")).toBe("fil");
    expect(fromApiLanguage("TAGLISH")).toBe("taglish");
  });

  it("covers every value in both directions and round-trips", () => {
    for (const stored of PREFERRED_LANGUAGE_VALUES) {
      expect(fromApiLanguage(toApiLanguage(stored))).toBe(stored);
    }
    for (const api of explanationLanguageSchema.options) {
      expect(toApiLanguage(fromApiLanguage(api))).toBe(api);
    }
  });

  it("falls back to EN / en for unknown values", () => {
    for (const value of ["", "FR", "En", "toString", null, undefined, 3, {}]) {
      expect(toApiLanguage(value)).toBe("EN");
      expect(fromApiLanguage(value)).toBe("en");
    }
  });
});

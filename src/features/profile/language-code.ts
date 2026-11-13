import type { ExplanationLanguage } from "@/contracts";
import {
  DEFAULT_PREFERRED_LANGUAGE,
  PREFERRED_LANGUAGE_VALUES,
  type PreferredLanguage,
} from "@/features/profile/types";

/** Profile storage uses lowercase codes; the API uses uppercase codes. */
export const DEFAULT_API_LANGUAGE: ExplanationLanguage = "EN";

const TO_API: Record<PreferredLanguage, ExplanationLanguage> = {
  en: "EN",
  fil: "FIL",
  taglish: "TAGLISH",
};

const FROM_API: Record<ExplanationLanguage, PreferredLanguage> = {
  EN: "en",
  FIL: "fil",
  TAGLISH: "taglish",
};

function isPreferredLanguage(value: unknown): value is PreferredLanguage {
  return (
    typeof value === "string" &&
    (PREFERRED_LANGUAGE_VALUES as readonly string[]).includes(value)
  );
}

function isApiLanguage(value: unknown): value is ExplanationLanguage {
  return typeof value === "string" && Object.hasOwn(FROM_API, value);
}

/** Stored profile language to API language. Unknown values become `EN`. */
export function toApiLanguage(value: unknown): ExplanationLanguage {
  return isPreferredLanguage(value) ? TO_API[value] : DEFAULT_API_LANGUAGE;
}

/** API language to stored profile language. Unknown values become `en`. */
export function fromApiLanguage(value: unknown): PreferredLanguage {
  return isApiLanguage(value) ? FROM_API[value] : DEFAULT_PREFERRED_LANGUAGE;
}

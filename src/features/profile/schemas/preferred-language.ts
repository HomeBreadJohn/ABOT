import { z } from "zod";

import {
  PREFERRED_LANGUAGE_VALUES,
  type PreferredLanguage,
} from "@/features/profile/types";

export const preferredLanguageSchema = z.enum(PREFERRED_LANGUAGE_VALUES, {
  error: "Select English, Filipino, or Taglish.",
});

export type PreferredLanguageInput = z.input<typeof preferredLanguageSchema>;

export function parsePreferredLanguage(value: unknown): PreferredLanguage {
  return preferredLanguageSchema.parse(value);
}

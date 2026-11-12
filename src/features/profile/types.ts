export const PREFERRED_LANGUAGE_VALUES = ["en", "fil", "taglish"] as const;

export type PreferredLanguage = (typeof PREFERRED_LANGUAGE_VALUES)[number];

export const PREFERRED_LANGUAGE_LABELS: Record<PreferredLanguage, string> = {
  en: "English",
  fil: "Filipino",
  taglish: "Taglish",
};

export const PREFERRED_LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "fil", label: "Filipino" },
  { value: "taglish", label: "Taglish" },
] as const satisfies ReadonlyArray<{
  value: PreferredLanguage;
  label: string;
}>;

export const DEFAULT_PREFERRED_LANGUAGE: PreferredLanguage = "en";

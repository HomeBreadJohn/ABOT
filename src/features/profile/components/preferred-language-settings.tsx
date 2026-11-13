"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { preferredLanguageSchema } from "@/features/profile/schemas/preferred-language";
import {
  PREFERRED_LANGUAGE_OPTIONS,
  type PreferredLanguage,
} from "@/features/profile/types";

const INVALID_LANGUAGE_MESSAGE = "Select English, Filipino, or Taglish.";
const SAVE_ERROR_MESSAGE =
  "We couldn't save your preferred language. Please try again.";

export function PreferredLanguageSettings({
  initialLanguage,
}: {
  initialLanguage: PreferredLanguage;
}) {
  const router = useRouter();
  const [selectedLanguage, setSelectedLanguage] =
    useState<PreferredLanguage>(initialLanguage);
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccessMessage(null);
    setErrorMessage(null);

    const result = preferredLanguageSchema.safeParse(selectedLanguage);

    if (!result.success) {
      setErrorMessage(INVALID_LANGUAGE_MESSAGE);
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferredLanguage: result.data }),
      });

      if (!response.ok) {
        setErrorMessage(
          response.status === 400
            ? INVALID_LANGUAGE_MESSAGE
            : SAVE_ERROR_MESSAGE,
        );
        return;
      }

      setSuccessMessage("Preferred language saved.");
      router.refresh();
    } catch {
      setErrorMessage(SAVE_ERROR_MESSAGE);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="min-w-0" onSubmit={handleSubmit}>
      <fieldset className="min-w-0" disabled={isSaving}>
        <legend className="text-sm font-medium text-slate-900">
          Explanation language
        </legend>
        <p className="mt-1 text-sm text-slate-500">
          Choose the language for future document explanations.
        </p>
        <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-3">
          {PREFERRED_LANGUAGE_OPTIONS.map((option) => {
            const inputId = `preferred-language-${option.value}`;

            return (
              <label
                className="flex min-w-0 cursor-pointer items-start gap-3 rounded-xl border border-slate-500 p-3 text-sm text-slate-800 transition-colors hover:border-slate-600 has-[:focus-visible]:border-slate-950 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-slate-300"
                htmlFor={inputId}
                key={option.value}
              >
                <input
                  checked={selectedLanguage === option.value}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-slate-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950"
                  id={inputId}
                  name="preferred-language"
                  onChange={() => setSelectedLanguage(option.value)}
                  type="radio"
                  value={option.value}
                />
                <span className="break-words">{option.label}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-5 flex min-w-0 flex-col items-start gap-3 sm:flex-row sm:items-center">
        <Button type="submit" disabled={isSaving}>
          {isSaving ? "Saving…" : "Save language"}
        </Button>
        {isSaving ? (
          <p
            className="text-sm text-slate-500"
            role="status"
            aria-live="polite"
          >
            Saving your preferred language…
          </p>
        ) : null}
      </div>

      {successMessage ? (
        <p
          className="mt-4 text-sm font-medium text-emerald-800"
          role="status"
          aria-live="polite"
        >
          {successMessage}
        </p>
      ) : null}
      {errorMessage ? (
        <p
          className="mt-4 text-sm font-medium text-rose-800"
          role="alert"
          aria-live="assertive"
        >
          {errorMessage}
        </p>
      ) : null}
    </form>
  );
}

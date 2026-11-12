"use client";

import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EvidenceReference } from "@/contracts";

export function CorrectionPanel({
  field,
  reason,
  evidence,
  defaultValue,
  onSave,
  onCancel,
}: {
  field: string;
  reason: string;
  evidence: EvidenceReference | undefined;
  defaultValue: string;
  onSave: (value: string) => void;
  onCancel: () => void;
}) {
  const inputId = useId();
  const errorId = useId();
  const [value, setValue] = useState(defaultValue);
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    const trimmed = value.trim();
    if (trimmed === "") {
      setError("Enter the correct amount.");
      return;
    }
    if (!/^\d+(\.\d+)?$/.test(trimmed)) {
      setError("Enter a number, for example 741.85.");
      return;
    }
    // shortcut: mock-only, no network call. Real wiring is
    // POST /api/documents/:id/corrections then refresh the analysis.
    setError(null);
    onSave(trimmed);
  }

  return (
    <Card
      role="region"
      aria-label={`Correct ${field}`}
      className="border-tone-caution-border bg-tone-caution-bg/40 mt-3 border-l-4"
    >
      <CardContent className="grid gap-3.5 pt-4 sm:pt-5">
        {evidence ? (
          <div className="text-body-sm text-ink-muted">
            <p className="text-ink-subtle text-caption font-semibold tracking-wide uppercase">
              What we read
            </p>
            <blockquote className="border-strong text-ink mt-1.5 border-l-2 pl-3 leading-relaxed italic">
              {evidence.excerpt}
            </blockquote>
            <p className="text-caption text-ink-subtle mt-1.5 tabular-nums">
              Page {evidence.pageNumber}
            </p>
          </div>
        ) : null}
        <p className="text-body-sm text-ink-muted max-w-prose">{reason}</p>
        <div className="grid gap-1.5">
          <Label htmlFor={inputId} required>
            {field}
          </Label>
          <Input
            id={inputId}
            inputMode="decimal"
            value={value}
            errorId={error ? errorId : undefined}
            invalid={error !== null}
            onChange={(event) => setValue(event.target.value)}
          />
          {error ? (
            <FormMessage id={errorId} variant="error">
              {error}
            </FormMessage>
          ) : null}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave}>
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

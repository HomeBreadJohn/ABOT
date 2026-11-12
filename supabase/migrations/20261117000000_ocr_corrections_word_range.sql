-- OCR corrections: add the word range the corrections contract requires and
-- complete the nullable corrected_value intent.
--
-- The corrections contract (src/contracts/api-corrections.ts) carries wordStart
-- and wordEnd per correction so a correction can target a specific OCR word
-- range, supersession is keyed on that range, and buildEffectivePages can mark
-- the corrected words as USER_CORRECTION. The base table (20261113000000) had
-- no word columns, so this adds them, mirroring evidence_references.
--
-- 20261115000000 already added a length CHECK that assumes corrected_value can
-- be NULL (`corrected_value is null or char_length(...) <= 2000`), but the base
-- column was still NOT NULL. An UNREADABLE correction (the user can't read it
-- either) stores no value, so this completes that intent by dropping NOT NULL.

alter table public.ocr_corrections
  add column word_start integer not null default 0 check (word_start >= 0);
alter table public.ocr_corrections
  add column word_end integer not null default 0 check (word_end >= word_start);
alter table public.ocr_corrections
  alter column corrected_value drop not null;

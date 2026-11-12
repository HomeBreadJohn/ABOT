-- Normalize legacy profile language values before enforcing the supported vocabulary.
update public.profiles
set preferred_language = 'en'
where preferred_language not in ('en', 'fil', 'taglish');

-- Recreate the named constraint so this migration also works after the earlier
-- domain proposal migration has been applied in the repository reset workflow.
alter table public.profiles
  drop constraint if exists profiles_preferred_language_values_check;

alter table public.profiles
  add constraint profiles_preferred_language_values_check
  check (preferred_language in ('en', 'fil', 'taglish'));

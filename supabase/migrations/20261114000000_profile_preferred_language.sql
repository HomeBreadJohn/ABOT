-- Normalize existing preferred_language values and enforce the supported enum (en, fil, taglish).

update public.profiles set preferred_language = 'en' where preferred_language not in ('en', 'fil', 'taglish');

alter table public.profiles add constraint profiles_preferred_language_values_check check (preferred_language in ('en', 'fil', 'taglish'));

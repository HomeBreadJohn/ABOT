-- PROPOSAL (not yet applied anywhere): domain model from product.md sections 12 and 13.
-- Status: needs approval from both owners before merging to main.
--
-- Deliberate deviations from product.md, to keep existing code working:
--   * `documents.user_id` is kept (spec says owner_id). Renaming would break
--     existing policies and src/features/documents/services/create-signed-url.ts.
--   * `profiles.full_name` is kept (spec says display_name).
--   * `processing_jobs.attempts` is kept (spec says attempt_count).
--   * `document_analyses` is extended instead of adding a new `analyses` table.
--     Its provider/model columns stay NOT NULL; the pipeline must set them.
--   * `document_tasks` is left untouched. `reminders` is new and separate.
--     Decide later whether document_tasks should be dropped.
--   * text/plain stays allowed at the database level; the app enforces the
--     supported formats (PDF, JPEG, PNG, TIFF, WebP) from product.md 5.1.
--   * document_relationships and cross_document_analyses are deferred to
--     Milestone 5.
--
-- Write access: pipeline-owned tables (pages, chunks, findings, evidence) have
-- no INSERT/UPDATE policies for `authenticated`. Person 2's pipeline writes
-- them with the service role. Users can only read them.

------------------------------------------------------------------------------
-- profiles: constrain language to the contract values
------------------------------------------------------------------------------
update public.profiles set preferred_language = 'en'
where preferred_language not in ('en', 'fil', 'taglish');

alter table public.profiles
  add constraint profiles_preferred_language_values_check
  check (preferred_language in ('en', 'fil', 'taglish'));

------------------------------------------------------------------------------
-- documents: lifecycle (product.md 13) and classification fields
------------------------------------------------------------------------------
alter table public.documents drop constraint documents_processing_status_check;

update public.documents set processing_status = case processing_status
  when 'uploading'  then 'UPLOADED'
  when 'pending'    then 'UPLOADED'
  when 'processing' then 'OCR_PROCESSING'
  when 'completed'  then 'COMPLETED'
  when 'failed'     then 'ANALYSIS_FAILED'
  else processing_status
end;

alter table public.documents alter column processing_status set default 'UPLOADED';

alter table public.documents add constraint documents_processing_status_check
  check (processing_status in (
    'UPLOADED', 'OCR_PROCESSING', 'OCR_READY', 'OCR_PARTIAL', 'OCR_FAILED',
    'ANALYZING', 'NEEDS_CORRECTION', 'REVIEW_REQUIRED', 'ANALYSIS_FAILED', 'COMPLETED'
  ));

alter table public.documents
  add column title text check (title is null or char_length(title) between 1 and 255),
  add column category text check (category is null or category in (
    'GOVERNMENT', 'FINANCIAL', 'EMPLOYMENT', 'LEGAL', 'MEDICAL',
    'EDUCATION', 'UTILITIES', 'PERSONAL', 'OTHER'
  )),
  add column subtype text,
  add column classification_confidence numeric(4, 3)
    check (classification_confidence is null or classification_confidence between 0 and 1),
  add column ocr_document_id text,
  add column page_count integer check (page_count is null or page_count >= 1),
  add column failure_reason text;

alter table public.documents drop constraint documents_mime_type_check;
alter table public.documents add constraint documents_mime_type_check
  check (mime_type in (
    'application/pdf', 'image/jpeg', 'image/png', 'image/tiff', 'image/webp', 'text/plain'
  ));

update storage.buckets
set allowed_mime_types = array[
  'application/pdf', 'image/jpeg', 'image/png', 'image/tiff', 'image/webp', 'text/plain'
]::text[]
where id = 'documents';

create index documents_user_status_idx on public.documents (user_id, processing_status);

------------------------------------------------------------------------------
-- Helper functions for policies (security invoker: RLS still applies)
------------------------------------------------------------------------------
create or replace function public.can_read_document(target_document_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (select 1 from public.documents d where d.id = target_document_id);
$$;

create or replace function public.owns_document(target_document_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1 from public.documents d
    where d.id = target_document_id and d.user_id = (select auth.uid())
  );
$$;

------------------------------------------------------------------------------
-- document_pages (12.3) - pipeline-written, user-readable
------------------------------------------------------------------------------
create table public.document_pages (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  page_number integer not null check (page_number >= 1),
  extracted_text text,
  ocr_status text not null default 'PENDING'
    check (ocr_status in ('PENDING', 'PROCESSING', 'READY', 'PARTIAL', 'FAILED')),
  average_confidence numeric(4, 3) check (average_confidence is null or average_confidence between 0 and 1),
  page_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  unique (document_id, page_number)
);

------------------------------------------------------------------------------
-- document_chunks (12.4) - internal to the pipeline, owner-readable
------------------------------------------------------------------------------
create table public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  page_start integer not null check (page_start >= 1),
  page_end integer not null,
  content text not null,
  processing_status text not null default 'PENDING'
    check (processing_status in ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
  created_at timestamptz not null default timezone('utc', now()),
  unique (document_id, chunk_index),
  check (page_end >= page_start)
);

------------------------------------------------------------------------------
-- document_analyses (12.5): extend for versioned, validated reports
------------------------------------------------------------------------------
alter table public.document_analyses
  add column version integer not null default 1 check (version >= 1),
  add column status text not null default 'QUEUED'
    check (status in ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED')),
  add column report_json jsonb,
  add column schema_version text,
  add column model_instance_id text,
  add column failure_reason text,
  add column completed_at timestamptz,
  add constraint document_analyses_document_version_key unique (document_id, version),
  -- A failed or unfinished analysis must never look like a completed report.
  add constraint document_analyses_report_requires_completed check (
    (status = 'COMPLETED' and report_json is not null and schema_version is not null)
    or (status <> 'COMPLETED' and report_json is null)
  );

------------------------------------------------------------------------------
-- findings (12.6) and evidence_references (12.7) - pipeline-written
------------------------------------------------------------------------------
create table public.findings (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.document_analyses (id) on delete cascade,
  -- Stable id from report_json, so retries upsert instead of duplicating.
  report_item_id text not null,
  finding_type text not null check (finding_type in (
    'KEY_INFORMATION', 'OBLIGATION', 'WATCHOUT', 'CONSEQUENCE',
    'NEXT_STEP', 'IMPORTANT_DATE', 'SPECIALIZED'
  )),
  title text not null,
  explanation text not null,
  severity text check (severity is null or severity in ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
  information_status text not null
    check (information_status in ('FOUND', 'NOT_FOUND', 'UNCLEAR', 'CONFLICTING', 'INFERRED')),
  confidence numeric(4, 3) check (confidence is null or confidence between 0 and 1),
  basis text,
  created_at timestamptz not null default timezone('utc', now()),
  unique (analysis_id, report_item_id)
);

create table public.evidence_references (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.document_analyses (id) on delete cascade,
  document_id uuid not null references public.documents (id) on delete cascade,
  report_item_id text not null,
  page_number integer not null check (page_number >= 1),
  excerpt text not null,
  source_type text not null check (source_type in ('OCR_TEXT', 'USER_CORRECTION')),
  word_start integer check (word_start is null or word_start >= 0),
  word_end integer,
  created_at timestamptz not null default timezone('utc', now()),
  unique (analysis_id, report_item_id),
  check (word_start is null or word_end is null or word_end >= word_start)
);

-- Join table: spec lists finding_id on evidence, but a finding may cite many.
create table public.finding_evidence (
  finding_id uuid not null references public.findings (id) on delete cascade,
  evidence_id uuid not null references public.evidence_references (id) on delete cascade,
  primary key (finding_id, evidence_id)
);

------------------------------------------------------------------------------
-- ocr_corrections (12.8) - append-only history
------------------------------------------------------------------------------
create table public.ocr_corrections (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  page_number integer not null check (page_number >= 1),
  review_requirement_id text,
  original_value text not null,
  corrected_value text not null,
  correction_status text not null default 'SUBMITTED'
    check (correction_status in ('SUBMITTED', 'REANALYSIS_PENDING', 'APPLIED')),
  created_at timestamptz not null default timezone('utc', now())
);

------------------------------------------------------------------------------
-- reminders (12.11)
------------------------------------------------------------------------------
create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  document_id uuid references public.documents (id) on delete set null,
  title text not null check (char_length(title) between 1 and 255),
  description text check (description is null or char_length(description) <= 2000),
  due_at timestamptz not null,
  reminder_at timestamptz,
  status text not null default 'PENDING' check (status in ('PENDING', 'COMPLETED', 'DISMISSED')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (reminder_at is null or reminder_at <= due_at)
);

------------------------------------------------------------------------------
-- conversations and messages (12.12)
------------------------------------------------------------------------------
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  document_id uuid not null references public.documents (id) on delete cascade,
  lumen_session_id text,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  role text not null check (role in ('USER', 'ASSISTANT')),
  content text not null check (char_length(content) between 1 and 20000),
  -- Evidence ids (report_item_id) the answer is grounded in.
  citation_evidence_ids text[] not null default '{}',
  created_at timestamptz not null default timezone('utc', now())
);

------------------------------------------------------------------------------
-- processing_jobs (12.13): add fields from the spec
------------------------------------------------------------------------------
alter table public.processing_jobs
  add column job_type text not null default 'OCR'
    check (job_type in ('OCR', 'CLASSIFICATION', 'CHUNKING', 'ANALYSIS', 'REANALYSIS')),
  add column error_code text,
  add column started_at timestamptz,
  add column completed_at timestamptz;

------------------------------------------------------------------------------
-- Indexes and triggers
------------------------------------------------------------------------------
create index document_pages_document_id_idx on public.document_pages (document_id);
create index document_chunks_document_id_idx on public.document_chunks (document_id);
create index findings_analysis_id_idx on public.findings (analysis_id);
create index evidence_references_analysis_id_idx on public.evidence_references (analysis_id);
create index evidence_references_document_page_idx on public.evidence_references (document_id, page_number);
create index finding_evidence_evidence_id_idx on public.finding_evidence (evidence_id);
create index ocr_corrections_document_id_idx on public.ocr_corrections (document_id);
create index ocr_corrections_user_id_idx on public.ocr_corrections (user_id);
create index reminders_user_status_due_idx on public.reminders (user_id, status, due_at);
create index reminders_document_id_idx on public.reminders (document_id);
create index conversations_user_id_idx on public.conversations (user_id);
create index conversations_document_id_idx on public.conversations (document_id);
create index messages_conversation_created_idx on public.messages (conversation_id, created_at);

create trigger reminders_set_updated_at before update on public.reminders
  for each row execute function public.set_updated_at();

------------------------------------------------------------------------------
-- Row Level Security
------------------------------------------------------------------------------
alter table public.document_pages enable row level security;
alter table public.document_chunks enable row level security;
alter table public.findings enable row level security;
alter table public.evidence_references enable row level security;
alter table public.finding_evidence enable row level security;
alter table public.ocr_corrections enable row level security;
alter table public.reminders enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

-- Pipeline-owned, read-only for users (owners and explicit share recipients).
create policy "Readers can view pages" on public.document_pages for select to authenticated
using (public.can_read_document(document_id));

create policy "Owners can view chunks" on public.document_chunks for select to authenticated
using (public.owns_document(document_id));

create policy "Readers can view findings" on public.findings for select to authenticated
using (exists (
  select 1 from public.document_analyses a
  where a.id = findings.analysis_id and public.can_read_document(a.document_id)
));

create policy "Readers can view evidence" on public.evidence_references for select to authenticated
using (public.can_read_document(document_id));

create policy "Readers can view finding evidence links" on public.finding_evidence for select to authenticated
using (exists (
  select 1 from public.findings f
  join public.document_analyses a on a.id = f.analysis_id
  where f.id = finding_evidence.finding_id and public.can_read_document(a.document_id)
));

-- Corrections: append-only. No update or delete policy on purpose.
create policy "Owners can view corrections" on public.ocr_corrections for select to authenticated
using (user_id = (select auth.uid()) and public.owns_document(document_id));
create policy "Owners can add corrections" on public.ocr_corrections for insert to authenticated
with check (user_id = (select auth.uid()) and public.owns_document(document_id));

-- Reminders: owner full control; a linked document must also be owned.
create policy "Users can view their reminders" on public.reminders for select to authenticated
using (user_id = (select auth.uid()));
create policy "Users can create their reminders" on public.reminders for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (document_id is null or public.owns_document(document_id))
);
create policy "Users can update their reminders" on public.reminders for update to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and (document_id is null or public.owns_document(document_id))
);
create policy "Users can delete their reminders" on public.reminders for delete to authenticated
using (user_id = (select auth.uid()));

-- Conversations: private to the owner of the conversation and the document.
create policy "Users can view their conversations" on public.conversations for select to authenticated
using (user_id = (select auth.uid()));
create policy "Users can create conversations" on public.conversations for insert to authenticated
with check (user_id = (select auth.uid()) and public.owns_document(document_id));
create policy "Users can delete their conversations" on public.conversations for delete to authenticated
using (user_id = (select auth.uid()));

-- Messages: users may only post USER messages. ASSISTANT messages are written
-- by the server with the service role after a grounded answer is produced.
create policy "Users can view their messages" on public.messages for select to authenticated
using (exists (
  select 1 from public.conversations c
  where c.id = messages.conversation_id and c.user_id = (select auth.uid())
));
create policy "Users can send messages" on public.messages for insert to authenticated
with check (
  role = 'USER'
  and exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id and c.user_id = (select auth.uid())
  )
);

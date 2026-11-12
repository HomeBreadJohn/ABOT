-- Task A5: shared document intelligence schema and RLS.
-- Lifecycle and enum literals match src/contracts/common.ts exactly.

-- ---------------------------------------------------------------------------
-- documents: new columns, lifecycle rewrite, mime rewrite, column-restricted
-- UPDATE for authenticated users.
-- ---------------------------------------------------------------------------

-- Map legacy statuses to contract lifecycle values before swapping the check.
update public.documents
   set processing_status = case processing_status
     when 'uploading' then 'AWAITING_UPLOAD'
     when 'pending' then 'UPLOADED'
     when 'processing' then 'OCR_PROCESSING'
     when 'completed' then 'COMPLETED'
     when 'failed' then 'ANALYSIS_FAILED'
     else processing_status
   end;

alter table public.documents
  drop constraint if exists documents_processing_status_check,
  drop constraint if exists documents_mime_type_check;

alter table public.documents
  add constraint documents_processing_status_check check (processing_status in (
    'AWAITING_UPLOAD', 'UPLOADED', 'OCR_PROCESSING', 'OCR_READY', 'OCR_PARTIAL',
    'OCR_FAILED', 'ANALYZING', 'NEEDS_CORRECTION', 'REVIEW_REQUIRED',
    'ANALYSIS_FAILED', 'COMPLETED'
  ));

alter table public.documents
  add constraint documents_mime_type_check check (mime_type in (
    'application/pdf', 'image/jpeg', 'image/png', 'image/tiff', 'image/webp'
  ));

alter table public.documents
  alter column processing_status set default 'AWAITING_UPLOAD';

alter table public.documents
  add column title text,
  add column category text check (category in (
    'GOVERNMENT', 'FINANCIAL', 'EMPLOYMENT', 'LEGAL', 'MEDICAL', 'EDUCATION',
    'UTILITIES', 'PERSONAL', 'OTHER'
  )),
  add column subtype text,
  add column classification_confidence numeric(4, 3)
    check (classification_confidence is null or classification_confidence between 0 and 1),
  add column ocr_document_id text,
  add column language text check (language in ('EN', 'FIL', 'TAGLISH'));

revoke update on table public.documents from authenticated;
grant update (title, category) on table public.documents to authenticated;

-- ---------------------------------------------------------------------------
-- document_analyses: versioned, statusful, idempotent. Users get read-only.
-- ---------------------------------------------------------------------------

alter table public.document_analyses
  add column version integer not null default 1 check (version >= 1),
  add column status text not null default 'RUNNING'
    check (status in ('RUNNING', 'SUCCEEDED', 'FAILED')),
  add column report_json jsonb,
  add column schema_version text,
  add column language text check (language in ('EN', 'FIL', 'TAGLISH')),
  add column model_instance_id text,
  add column idempotency_key text,
  add column completed_at timestamptz,
  add constraint document_analyses_document_id_version_key unique (document_id, version),
  add constraint document_analyses_document_id_idempotency_key unique (document_id, idempotency_key);

drop policy "Document owners can create analyses" on public.document_analyses;
drop policy "Document owners can update analyses" on public.document_analyses;
drop policy "Document owners can delete analyses" on public.document_analyses;

-- ---------------------------------------------------------------------------
-- New tables (product.md section 12, plus user_id ownership, timestamps,
-- and cascade foreign keys).
-- ---------------------------------------------------------------------------

create table public.document_pages (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  page_number integer not null check (page_number >= 1),
  extracted_text text not null default '',
  ocr_status text not null check (ocr_status in ('READY', 'FAILED')),
  average_confidence numeric(4, 3)
    check (average_confidence is null or average_confidence between 0 and 1),
  page_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (document_id, page_number)
);

create table public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  page_start integer not null check (page_start >= 1),
  page_end integer not null check (page_end >= page_start),
  content text not null,
  processing_status text not null default 'PENDING'
    check (processing_status in ('PENDING', 'DONE', 'FAILED')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (document_id, chunk_index)
);

create table public.findings (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.document_analyses (id) on delete cascade,
  document_id uuid not null references public.documents (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  finding_type text not null check (char_length(finding_type) between 1 and 64),
  title text not null check (char_length(title) between 1 and 255),
  explanation text not null,
  severity text not null check (severity in ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
  information_status text not null
    check (information_status in ('FOUND', 'NOT_FOUND', 'UNCLEAR', 'CONFLICTING', 'INFERRED')),
  confidence numeric(4, 3) check (confidence is null or confidence between 0 and 1),
  basis text,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.evidence_references (
  id uuid primary key default gen_random_uuid(),
  finding_id uuid not null references public.findings (id) on delete cascade,
  document_id uuid not null references public.documents (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  page_number integer not null check (page_number >= 1),
  excerpt text not null,
  source_type text not null check (source_type in ('OCR_TEXT', 'USER_CORRECTION')),
  word_start integer not null default 0 check (word_start >= 0),
  word_end integer not null default 0 check (word_end >= 0),
  match_confidence numeric(4, 3)
    check (match_confidence is null or match_confidence between 0 and 1),
  created_at timestamptz not null default timezone('utc', now()),
  check (word_end >= word_start)
);

create table public.ocr_corrections (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  page_number integer not null check (page_number >= 1),
  original_value text not null,
  corrected_value text not null,
  correction_status text not null default 'PENDING'
    check (correction_status in ('PENDING', 'APPLIED', 'REJECTED')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.analysis_translations (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.document_analyses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  language text not null check (language in ('EN', 'FIL', 'TAGLISH')),
  translated_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  unique (analysis_id, language)
);

create table public.document_relationships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source_document_id uuid not null references public.documents (id) on delete cascade,
  target_document_id uuid not null references public.documents (id) on delete cascade,
  relationship_type text not null check (relationship_type in (
    'POSSIBLE_MATCH', 'CONFIRMED_MATCH', 'CONTRADICTS', 'SUPPLEMENTS',
    'SUPERSEDES', 'UNRELATED'
  )),
  confidence numeric(4, 3) check (confidence is null or confidence between 0 and 1),
  approval_status text not null default 'PENDING'
    check (approval_status in ('PENDING', 'APPROVED', 'REJECTED')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (source_document_id <> target_document_id)
);

create table public.cross_document_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'RUNNING' check (status in ('RUNNING', 'SUCCEEDED', 'FAILED')),
  report_json jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.cross_document_analysis_documents (
  id uuid primary key default gen_random_uuid(),
  cross_document_analysis_id uuid not null
    references public.cross_document_analyses (id) on delete cascade,
  document_id uuid not null references public.documents (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  unique (cross_document_analysis_id, document_id)
);

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  document_id uuid references public.documents (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 255),
  description text,
  due_at timestamptz,
  reminder_at timestamptz,
  status text not null default 'PENDING' check (status in ('PENDING', 'SENT', 'DISMISSED')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

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
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 4000),
  created_at timestamptz not null default timezone('utc', now())
);

-- provider_calls stores operation metadata only, never document or AI content.
create table public.provider_calls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  document_id uuid references public.documents (id) on delete cascade,
  operation text not null check (char_length(operation) between 1 and 64),
  credits integer not null check (credits >= 0),
  status text not null check (char_length(status) between 1 and 32),
  duration_ms integer not null check (duration_ms >= 0),
  created_at timestamptz not null default timezone('utc', now())
);

-- ---------------------------------------------------------------------------
-- processing_jobs: durable queue with leases and idempotency.
-- ---------------------------------------------------------------------------

alter table public.processing_jobs
  add column job_type text not null default 'ANALYZE'
    check (job_type in ('OCR_SUBMIT', 'OCR_POLL', 'OCR_FETCH', 'ANALYZE', 'REANALYZE', 'TRANSLATE', 'CROSS_ANALYZE')),
  -- shortcut: default 'ANALYZE' only exists so ALTER keeps working if a legacy
  -- row ever exists; every real enqueue sets job_type explicitly.
  add column step integer check (step >= 1),
  add column payload jsonb not null default '{}'::jsonb,
  add column idempotency_key text,
  add constraint processing_jobs_idempotency_key_key unique (idempotency_key),
  add column run_after timestamptz not null default timezone('utc', now()),
  add column lease_expires_at timestamptz,
  add column error_code text,
  add column started_at timestamptz,
  add column completed_at timestamptz,
  add column max_attempts integer not null default 5 check (max_attempts >= 1);

alter table public.processing_jobs
  drop constraint if exists processing_jobs_status_check;

alter table public.processing_jobs
  add constraint processing_jobs_status_check check (status in (
    'queued', 'RETRY_SCHEDULED', 'processing', 'completed', 'failed'
  ));

drop policy "Owners can create processing jobs" on public.processing_jobs;
drop policy "Owners can update processing jobs" on public.processing_jobs;

create index processing_jobs_claim_idx on public.processing_jobs (status, run_after);

-- ---------------------------------------------------------------------------
-- Indexes for the new tables.
-- ---------------------------------------------------------------------------

create index document_pages_document_id_idx on public.document_pages (document_id);
create index document_chunks_document_id_idx on public.document_chunks (document_id);
create index findings_analysis_id_idx on public.findings (analysis_id);
create index findings_document_id_idx on public.findings (document_id);
create index evidence_references_finding_id_idx on public.evidence_references (finding_id);
create index evidence_references_document_id_idx on public.evidence_references (document_id);
create index ocr_corrections_document_id_idx on public.ocr_corrections (document_id);
create index ocr_corrections_user_id_idx on public.ocr_corrections (user_id);
create index analysis_translations_analysis_id_idx on public.analysis_translations (analysis_id);
create index document_relationships_user_id_idx on public.document_relationships (user_id);
create index cross_document_analysis_documents_document_id_idx
  on public.cross_document_analysis_documents (document_id);
create index reminders_user_id_idx on public.reminders (user_id);
create index conversations_user_id_idx on public.conversations (user_id);
create index messages_conversation_id_idx on public.messages (conversation_id);
create index provider_calls_user_id_idx on public.provider_calls (user_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers on the mutable tables.
-- ---------------------------------------------------------------------------

create trigger document_pages_set_updated_at before update on public.document_pages for each row execute function public.set_updated_at();
create trigger document_chunks_set_updated_at before update on public.document_chunks for each row execute function public.set_updated_at();
create trigger ocr_corrections_set_updated_at before update on public.ocr_corrections for each row execute function public.set_updated_at();
create trigger document_relationships_set_updated_at before update on public.document_relationships for each row execute function public.set_updated_at();
create trigger reminders_set_updated_at before update on public.reminders for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Share policies: the initial schema's share policies queried documents,
-- whose select policy queries document_shares, causing
-- "infinite recursion detected in policy". Replace them with policies that
-- use a security definer ownership check so no recursion happens.
-- ---------------------------------------------------------------------------

create or replace function public.owns_document(p_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.documents
    where id = p_document_id and user_id = (select auth.uid())
  );
$$;

revoke execute on function public.owns_document(uuid) from public, anon;
grant execute on function public.owns_document(uuid) to authenticated, service_role;

drop policy "Owners can create shares" on public.document_shares;
drop policy "Owners can update shares" on public.document_shares;
drop policy "Owners can delete shares" on public.document_shares;

create policy "Owners can create shares" on public.document_shares for insert to authenticated
with check (owner_id = (select auth.uid()) and public.owns_document(document_shares.document_id));
create policy "Owners can update shares" on public.document_shares for update to authenticated
using (owner_id = (select auth.uid()) and public.owns_document(document_shares.document_id))
with check (owner_id = (select auth.uid()) and public.owns_document(document_shares.document_id));
create policy "Owners can delete shares" on public.document_shares for delete to authenticated
using (owner_id = (select auth.uid()) and public.owns_document(document_shares.document_id));

-- ---------------------------------------------------------------------------
-- RLS on the new tables.
-- ---------------------------------------------------------------------------

alter table public.document_pages enable row level security;
alter table public.document_chunks enable row level security;
alter table public.findings enable row level security;
alter table public.evidence_references enable row level security;
alter table public.ocr_corrections enable row level security;
alter table public.analysis_translations enable row level security;
alter table public.document_relationships enable row level security;
alter table public.cross_document_analyses enable row level security;
alter table public.cross_document_analysis_documents enable row level security;
alter table public.reminders enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.provider_calls enable row level security;

-- Group 1: document-derived tables. Owner and share recipients read;
-- only the service role (bypasses RLS) writes.
create policy "Owners and share recipients can view pages" on public.document_pages for select to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1 from public.document_shares shares
    where shares.document_id = document_pages.document_id and shares.shared_with_user_id = (select auth.uid())
  )
);
create policy "Owners and share recipients can view chunks" on public.document_chunks for select to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1 from public.document_shares shares
    where shares.document_id = document_chunks.document_id and shares.shared_with_user_id = (select auth.uid())
  )
);
create policy "Owners and share recipients can view findings" on public.findings for select to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1 from public.document_shares shares
    where shares.document_id = findings.document_id and shares.shared_with_user_id = (select auth.uid())
  )
);
create policy "Owners and share recipients can view evidence" on public.evidence_references for select to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1 from public.document_shares shares
    where shares.document_id = evidence_references.document_id and shares.shared_with_user_id = (select auth.uid())
  )
);
create policy "Owners and share recipients can view translations" on public.analysis_translations for select to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1 from public.document_analyses analyses
    join public.document_shares shares on shares.document_id = analyses.document_id
    where analyses.id = analysis_translations.analysis_id
      and shares.shared_with_user_id = (select auth.uid())
  )
);

-- Group 2: owner read/write tables.
create policy "Owners can view their corrections" on public.ocr_corrections for select to authenticated
using (user_id = (select auth.uid()));
create policy "Owners can create corrections on their documents" on public.ocr_corrections for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (select 1 from public.documents where id = ocr_corrections.document_id and user_id = (select auth.uid()))
);

create policy "Owners can view their relationships" on public.document_relationships for select to authenticated
using (user_id = (select auth.uid()));
create policy "Owners can create relationships between their documents" on public.document_relationships for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (select 1 from public.documents where id = source_document_id and user_id = (select auth.uid()))
  and exists (select 1 from public.documents where id = target_document_id and user_id = (select auth.uid()))
);
create policy "Owners can update their relationships" on public.document_relationships for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "Owners can view their reminders" on public.reminders for select to authenticated
using (user_id = (select auth.uid()));
create policy "Owners can create their reminders" on public.reminders for insert to authenticated
with check (user_id = (select auth.uid()));
create policy "Owners can update their reminders" on public.reminders for update to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Owners can delete their reminders" on public.reminders for delete to authenticated
using (user_id = (select auth.uid()));

create policy "Owners can view their conversations" on public.conversations for select to authenticated
using (user_id = (select auth.uid()));
create policy "Owners can open conversations on their documents" on public.conversations for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (select 1 from public.documents where id = conversations.document_id and user_id = (select auth.uid()))
);

create policy "Owners can view messages in their conversations" on public.messages for select to authenticated
using (
  exists (
    select 1 from public.conversations conversations
    where conversations.id = messages.conversation_id and conversations.user_id = (select auth.uid())
  )
);
create policy "Owners can post messages in their conversations" on public.messages for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.conversations conversations
    where conversations.id = messages.conversation_id and conversations.user_id = (select auth.uid())
  )
);

-- Group 3: service-role-written tables; owners read their own rows.
create policy "Owners can view their cross-document analyses" on public.cross_document_analyses for select to authenticated
using (user_id = (select auth.uid()));
create policy "Owners can view their cross-document analysis documents" on public.cross_document_analysis_documents for select to authenticated
using (user_id = (select auth.uid()));
create policy "Owners can view their provider calls" on public.provider_calls for select to authenticated
using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- claim_processing_job: lease one due or expired-lease job atomically.
-- service_role only.
-- ---------------------------------------------------------------------------

create or replace function public.claim_processing_job(lease_seconds integer)
returns public.processing_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed public.processing_jobs;
begin
  with due as (
    select jobs.id
      from public.processing_jobs jobs
     where (jobs.status in ('queued', 'RETRY_SCHEDULED')
            and jobs.run_after <= timezone('utc', now()))
        or (jobs.status = 'processing'
            and jobs.lease_expires_at is not null
            and jobs.lease_expires_at < timezone('utc', now()))
     order by jobs.run_after, jobs.created_at
     limit 1
     for update skip locked
  )
  update public.processing_jobs jobs
     set status = 'processing',
         lease_expires_at = timezone('utc', now()) + make_interval(secs => lease_seconds),
         attempts = jobs.attempts + 1,
         started_at = coalesce(jobs.started_at, timezone('utc', now())),
         updated_at = timezone('utc', now())
    from due
   where jobs.id = due.id
   returning jobs.* into claimed;
  return claimed;
end;
$$;

revoke execute on function public.claim_processing_job(integer) from public, anon, authenticated;
grant execute on function public.claim_processing_job(integer) to service_role;

-- ---------------------------------------------------------------------------
-- persist_analysis: transactional insert of analysis version + findings +
-- evidence, plus the document status update. Idempotent on idempotency_key.
-- service_role only.
--
-- p_findings: array of { findingType, title, explanation, severity,
--   informationStatus, confidence, basis, evidenceIds: string[] }
-- p_evidence: array of { id, pageNumber, excerpt, sourceType, wordStart,
--   wordEnd, matchConfidence }
-- p_outcome: 'COMPLETED' | 'REVIEW_REQUIRED' | 'NEEDS_CORRECTION'
-- ---------------------------------------------------------------------------

create or replace function public.persist_analysis(
  p_document_id uuid,
  p_user_id uuid,
  p_idempotency_key text,
  p_report jsonb,
  p_schema_version text,
  p_language text,
  p_model_instance_id text,
  p_findings jsonb,
  p_evidence jsonb,
  p_outcome text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_id uuid;
  analysis_id uuid;
  next_version integer;
  finding jsonb;
  finding_id uuid;
  evidence_id text;
  evidence_row jsonb;
  evidence_db_id uuid;
  evidence_map jsonb := '{}'::jsonb;
begin
  if p_outcome not in ('COMPLETED', 'REVIEW_REQUIRED', 'NEEDS_CORRECTION') then
    raise exception 'invalid analysis outcome: %', p_outcome;
  end if;

  select id into existing_id
    from public.document_analyses
   where document_id = p_document_id
     and idempotency_key = p_idempotency_key
   limit 1;
  if existing_id is not null then
    return existing_id;
  end if;

  select coalesce(max(version), 0) + 1 into next_version
    from public.document_analyses
   where document_id = p_document_id;

  insert into public.document_analyses
    (document_id, user_id, provider, model, extracted_data, version, status,
     report_json, schema_version, language, model_instance_id, idempotency_key,
     completed_at)
  values
    (p_document_id, p_user_id, 'lumen', 'ai-chat', '{}'::jsonb, next_version,
     'SUCCEEDED', p_report, p_schema_version, p_language, p_model_instance_id,
     p_idempotency_key, timezone('utc', now()))
  returning id into analysis_id;

  for finding in select * from jsonb_array_elements(p_findings) loop
    insert into public.findings
      (analysis_id, document_id, user_id, finding_type, title, explanation,
       severity, information_status, confidence, basis)
    values
      (analysis_id, p_document_id, p_user_id,
       finding->>'findingType', finding->>'title', finding->>'explanation',
       finding->>'severity', finding->>'informationStatus',
       nullif(finding->>'confidence', '')::numeric, finding->>'basis')
    returning id into finding_id;

    for evidence_id in select jsonb_array_elements_text(coalesce(finding->'evidenceIds', '[]'::jsonb)) loop
      if evidence_map ? evidence_id then
        continue;
      end if;
      select e into evidence_row
        from jsonb_array_elements(p_evidence) e
       where e->>'id' = evidence_id
       limit 1;
      if not found then
        continue;
      end if;
      insert into public.evidence_references
        (finding_id, document_id, user_id, page_number, excerpt, source_type,
         word_start, word_end, match_confidence)
      values
        (finding_id, p_document_id, p_user_id,
         (evidence_row->>'pageNumber')::integer,
         evidence_row->>'excerpt',
         evidence_row->>'sourceType',
         coalesce((evidence_row->>'wordStart')::integer, 0),
         coalesce((evidence_row->>'wordEnd')::integer, 0),
         nullif(evidence_row->>'matchConfidence', '')::numeric)
      returning id into evidence_db_id;
      evidence_map := jsonb_set(evidence_map, array[evidence_id], to_jsonb(evidence_db_id));
    end loop;
  end loop;

  update public.documents
     set processing_status = p_outcome
   where id = p_document_id;

  return analysis_id;
end;
$$;

revoke execute on function public.persist_analysis(uuid, uuid, text, jsonb, text, text, text, jsonb, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.persist_analysis(uuid, uuid, text, jsonb, text, text, text, jsonb, jsonb, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- Storage bucket: align allowed mime types with the contract.
-- ---------------------------------------------------------------------------

update storage.buckets
   set allowed_mime_types = array[
     'application/pdf', 'image/jpeg', 'image/png', 'image/tiff', 'image/webp'
   ]::text[]
 where id = 'documents';

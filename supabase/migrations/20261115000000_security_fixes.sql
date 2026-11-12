-- Security fixes for the shared document intelligence schema.
-- Restricts document creation to the initial state, hardens the security
-- definer functions (derive owner from the document, lock search_path),
-- drops the dead document_tasks table, and bounds correction length.

-- ---------------------------------------------------------------------------
-- documents INSERT: only allow creating a row in the initial state.
-- ---------------------------------------------------------------------------

drop policy "Users can create their own documents" on public.documents;
create policy "Users can create their own documents" on public.documents for insert to authenticated
with check (
  user_id = (select auth.uid())
  and processing_status = 'AWAITING_UPLOAD'
  and ocr_document_id is null
  and classification_confidence is null
);

-- ---------------------------------------------------------------------------
-- owns_document: lock search_path, fully schema-qualify. Logic unchanged.
-- ---------------------------------------------------------------------------

create or replace function public.owns_document(p_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.documents
    where id = p_document_id and user_id = (select auth.uid())
  );
$$;

-- ---------------------------------------------------------------------------
-- claim_processing_job: lock search_path, fully schema-qualify. Logic
-- unchanged.
-- ---------------------------------------------------------------------------

create or replace function public.claim_processing_job(lease_seconds integer)
returns public.processing_jobs
language plpgsql
security definer
set search_path = ''
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

-- ---------------------------------------------------------------------------
-- persist_analysis: derive the owner from the document instead of trusting
-- the p_user_id parameter. Lock search_path, fully schema-qualify. Same
-- signature as 20261113000000_document_intelligence_schema.sql.
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
set search_path = ''
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
  -- Derive the owner from the document; never trust the caller's p_user_id.
  select user_id into p_user_id from public.documents where id = p_document_id;
  if p_user_id is null then
    raise exception 'unknown document %', p_document_id;
  end if;

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
-- Drop the dead document_tasks table (only the generated types referenced it).
-- ---------------------------------------------------------------------------

drop table if exists public.document_tasks cascade;

-- ---------------------------------------------------------------------------
-- Bound the stored corrected value length.
-- ---------------------------------------------------------------------------

alter table public.ocr_corrections
  add constraint ocr_corrections_corrected_value_len
  check (corrected_value is null or char_length(corrected_value) <= 2000);

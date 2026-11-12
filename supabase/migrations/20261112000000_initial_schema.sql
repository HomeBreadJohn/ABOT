create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  preferred_language text not null default 'en' check (char_length(preferred_language) between 2 and 16),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  original_filename text not null check (char_length(original_filename) between 1 and 255),
  storage_path text not null unique check (storage_path like user_id::text || '/%'),
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'text/plain')),
  file_size bigint not null check (file_size > 0 and file_size <= 10485760),
  document_type text,
  processing_status text not null default 'pending' check (processing_status in ('uploading', 'pending', 'processing', 'completed', 'failed')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.document_analyses (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (char_length(provider) between 1 and 64),
  model text not null check (char_length(model) between 1 and 128),
  extracted_data jsonb not null default '{}'::jsonb,
  explanation text,
  confidence numeric(4, 3) check (confidence is null or confidence between 0 and 1),
  created_at timestamptz not null default timezone('utc', now())
);

create table public.document_tasks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 255),
  description text,
  due_date date,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed', 'cancelled')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.document_shares (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  shared_with_user_id uuid not null references auth.users (id) on delete cascade,
  permission text not null default 'viewer' check (permission in ('viewer', 'editor')),
  created_at timestamptz not null default timezone('utc', now()),
  unique (document_id, shared_with_user_id),
  check (owner_id <> shared_with_user_id)
);

create table public.processing_jobs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'processing', 'completed', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  error_message text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index documents_user_id_idx on public.documents (user_id);
create index documents_status_idx on public.documents (processing_status);
create index document_analyses_document_id_idx on public.document_analyses (document_id);
create index document_analyses_user_id_idx on public.document_analyses (user_id);
create index document_tasks_document_id_idx on public.document_tasks (document_id);
create index document_tasks_user_id_status_idx on public.document_tasks (user_id, status);
create index document_shares_shared_with_user_id_idx on public.document_shares (shared_with_user_id);
create index document_shares_owner_id_idx on public.document_shares (owner_id);
create index processing_jobs_status_idx on public.processing_jobs (status);
create index processing_jobs_user_id_idx on public.processing_jobs (user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger documents_set_updated_at before update on public.documents for each row execute function public.set_updated_at();
create trigger document_tasks_set_updated_at before update on public.document_tasks for each row execute function public.set_updated_at();
create trigger processing_jobs_set_updated_at before update on public.processing_jobs for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''));
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.documents enable row level security;
alter table public.document_analyses enable row level security;
alter table public.document_tasks enable row level security;
alter table public.document_shares enable row level security;
alter table public.processing_jobs enable row level security;

create policy "Users can view their profile" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "Users can update their profile" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "Owners and explicit recipients can view documents" on public.documents for select to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1 from public.document_shares shares
    where shares.document_id = documents.id and shares.shared_with_user_id = (select auth.uid())
  )
);
create policy "Users can create their own documents" on public.documents for insert to authenticated
with check (user_id = (select auth.uid()));
create policy "Owners can update documents" on public.documents for update to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Owners can delete documents" on public.documents for delete to authenticated
using (user_id = (select auth.uid()));

create policy "Owners and explicit recipients can view analyses" on public.document_analyses for select to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1 from public.document_shares shares
    where shares.document_id = document_analyses.document_id and shares.shared_with_user_id = (select auth.uid())
  )
);
create policy "Document owners can create analyses" on public.document_analyses for insert to authenticated
with check (user_id = (select auth.uid()) and exists (select 1 from public.documents where id = document_id and user_id = (select auth.uid())));
create policy "Document owners can update analyses" on public.document_analyses for update to authenticated
using (user_id = (select auth.uid()) and exists (select 1 from public.documents where id = document_id and user_id = (select auth.uid())))
with check (user_id = (select auth.uid()) and exists (select 1 from public.documents where id = document_id and user_id = (select auth.uid())));
create policy "Document owners can delete analyses" on public.document_analyses for delete to authenticated
using (user_id = (select auth.uid()));

create policy "Owners and explicit recipients can view tasks" on public.document_tasks for select to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1 from public.document_shares shares
    where shares.document_id = document_tasks.document_id and shares.shared_with_user_id = (select auth.uid())
  )
);
create policy "Document owners can create tasks" on public.document_tasks for insert to authenticated
with check (user_id = (select auth.uid()) and exists (select 1 from public.documents where id = document_id and user_id = (select auth.uid())));
create policy "Document owners can update tasks" on public.document_tasks for update to authenticated
using (user_id = (select auth.uid()) and exists (select 1 from public.documents where id = document_id and user_id = (select auth.uid())))
with check (user_id = (select auth.uid()) and exists (select 1 from public.documents where id = document_id and user_id = (select auth.uid())));
create policy "Document owners can delete tasks" on public.document_tasks for delete to authenticated
using (user_id = (select auth.uid()));

create policy "Owners and recipients can view shares" on public.document_shares for select to authenticated
using (owner_id = (select auth.uid()) or shared_with_user_id = (select auth.uid()));
create policy "Owners can create shares" on public.document_shares for insert to authenticated
with check (owner_id = (select auth.uid()) and exists (select 1 from public.documents where id = document_id and user_id = (select auth.uid())));
create policy "Owners can update shares" on public.document_shares for update to authenticated
using (owner_id = (select auth.uid()) and exists (select 1 from public.documents where id = document_id and user_id = (select auth.uid())))
with check (owner_id = (select auth.uid()) and exists (select 1 from public.documents where id = document_id and user_id = (select auth.uid())));
create policy "Owners can delete shares" on public.document_shares for delete to authenticated
using (owner_id = (select auth.uid()));

create policy "Owners can view processing jobs" on public.processing_jobs for select to authenticated using (user_id = (select auth.uid()));
create policy "Owners can create processing jobs" on public.processing_jobs for insert to authenticated with check (user_id = (select auth.uid()) and exists (select 1 from public.documents where id = document_id and user_id = (select auth.uid())));
create policy "Owners can update processing jobs" on public.processing_jobs for update to authenticated
using (user_id = (select auth.uid()) and exists (select 1 from public.documents where id = document_id and user_id = (select auth.uid())))
with check (user_id = (select auth.uid()) and exists (select 1 from public.documents where id = document_id and user_id = (select auth.uid())));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'text/plain']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Document owners can upload files" on storage.objects for insert to authenticated
with check (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "Document owners can read files" on storage.objects for select to authenticated
using (
  bucket_id = 'documents'
  and exists (select 1 from public.documents where storage_path = name and user_id = (select auth.uid()))
);
create policy "Document owners can update files" on storage.objects for update to authenticated
using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "Document owners can delete files" on storage.objects for delete to authenticated
using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid()::text));

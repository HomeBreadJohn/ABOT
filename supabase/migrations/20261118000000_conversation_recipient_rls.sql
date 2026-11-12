-- ---------------------------------------------------------------------------
-- Grounded follow-up conversations (plan Task B20).
--
-- 1. Let a share recipient open their OWN conversation on a shared document.
--    Previously the conversations INSERT policy required document OWNERSHIP, so
--    a user a document was shared with could not start a conversation on it.
--    The with-check still pins the row to the caller (user_id = auth.uid()), so
--    a recipient only ever creates their own conversation. The SELECT policy is
--    unchanged (user_id = auth.uid()), so a recipient never sees the owner's
--    conversations, and the owner never sees a recipient's. The messages
--    policies are unchanged: they key off conversations.user_id = auth.uid(),
--    which is now possibly a recipient's own conversation.
--
-- 2. Store the evidence IDs cited by an assistant message so history can return
--    them from the database (the source of truth). No content is stored here
--    beyond the IDs that already appear in the analysis.
-- ---------------------------------------------------------------------------

-- Assistant messages record which analysis evidence IDs they cited.
alter table public.messages
  add column evidence_ids text[] not null default '{}'::text[];

-- Recipient-or-owner INSERT on conversations.
drop policy if exists "Owners can open conversations on their documents" on public.conversations;

create policy "Open own conversation on an owned or shared document"
on public.conversations for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.documents d
    where d.id = conversations.document_id
      and (
        d.user_id = (select auth.uid())
        or exists (
          select 1 from public.document_shares s
          where s.document_id = d.id
            and s.shared_with_user_id = (select auth.uid())
        )
      )
  )
);

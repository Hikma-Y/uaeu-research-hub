-- Persist reply, forward, and edit information for direct messages.
-- Run once in the Supabase SQL Editor.

alter table public.direct_messages
  add column if not exists reply_to_id uuid references public.direct_messages(id) on delete set null,
  add column if not exists forwarded_from_id uuid references public.direct_messages(id) on delete set null,
  add column if not exists edited_at timestamptz;

grant update on table public.direct_messages to authenticated;

drop policy if exists "Users edit own sent messages" on public.direct_messages;
create policy "Users edit own sent messages"
on public.direct_messages
for update
to authenticated
using (sender_id = auth.uid())
with check (sender_id = auth.uid());

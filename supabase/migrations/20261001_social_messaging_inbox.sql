-- Conversation ordering and unread indicators for direct messages.
-- Run once in the Supabase SQL Editor after direct_messaging.sql.

alter table public.direct_messages
  add column if not exists read_at timestamptz;

create index if not exists direct_messages_recipient_unread_idx
  on public.direct_messages (recipient_id, read_at, created_at desc)
  where read_at is null;

create or replace function public.mark_direct_messages_read(p_sender_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to read messages.' using errcode = '42501';
  end if;

  update public.direct_messages
  set read_at = now()
  where sender_id = p_sender_id
    and recipient_id = auth.uid()
    and read_at is null;
end;
$$;

revoke all on function public.mark_direct_messages_read(uuid) from public;
grant execute on function public.mark_direct_messages_read(uuid) to authenticated;

notify pgrst, 'reload schema';

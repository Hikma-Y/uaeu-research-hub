-- Private one-to-one messaging for signed-in UAEU Research Hub users.
-- Run once in Supabase SQL Editor.

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  body text,
  attachment_path text,
  attachment_name text,
  attachment_type text,
  attachment_size bigint,
  created_at timestamptz not null default now(),
  check (sender_id <> recipient_id),
  constraint direct_messages_content_check check (
    nullif(trim(coalesce(body, '')), '') is not null
    or attachment_path is not null
  )
);

alter table public.direct_messages
  add column if not exists attachment_path text,
  add column if not exists attachment_name text,
  add column if not exists attachment_type text,
  add column if not exists attachment_size bigint;

alter table public.direct_messages alter column body drop not null;
alter table public.direct_messages drop constraint if exists direct_messages_body_check;
alter table public.direct_messages drop constraint if exists direct_messages_content_check;
alter table public.direct_messages add constraint direct_messages_content_check check (
  nullif(trim(coalesce(body, '')), '') is not null
  or attachment_path is not null
);

create index if not exists direct_messages_participants_created_idx
  on public.direct_messages (sender_id, recipient_id, created_at);

alter table public.direct_messages enable row level security;

grant select, insert on table public.direct_messages to authenticated;

drop policy if exists "Users read own direct messages" on public.direct_messages;
create policy "Users read own direct messages"
on public.direct_messages
for select
using (sender_id = auth.uid() or recipient_id = auth.uid());

drop policy if exists "Users send direct messages" on public.direct_messages;
create policy "Users send direct messages"
on public.direct_messages
for insert
with check (sender_id = auth.uid() and recipient_id <> auth.uid());

create or replace view public.message_directory
with (security_barrier = true)
as
  select id, full_name, role, department
  from public.profiles
  where coalesce(account_status, 'active') = 'active';

grant select on public.message_directory to authenticated;
grant select, insert on table storage.objects to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'message-attachments',
  'message-attachments',
  false,
  10485760,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users upload own message attachments" on storage.objects;
create policy "Users upload own message attachments"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'message-attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Participants read message attachments" on storage.objects;
create policy "Participants read message attachments"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'message-attachments'
  and exists (
    select 1
    from public.direct_messages
    where direct_messages.attachment_path = storage.objects.name
      and (
        direct_messages.sender_id = auth.uid()
        or direct_messages.recipient_id = auth.uid()
      )
  )
);

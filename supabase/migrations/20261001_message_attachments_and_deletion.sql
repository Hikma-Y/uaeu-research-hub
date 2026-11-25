-- Support all attachment types and allow a sender to delete a message for all
-- conversation participants.
-- Run once in the Supabase SQL Editor.

update storage.buckets
set allowed_mime_types = null
where id = 'message-attachments';

grant delete on table public.direct_messages to authenticated;

drop policy if exists "Users delete own sent messages" on public.direct_messages;
create policy "Users delete own sent messages"
on public.direct_messages
for delete
to authenticated
using (sender_id = auth.uid());

grant delete on table storage.objects to authenticated;

drop policy if exists "Users delete own message attachments" on storage.objects;
create policy "Users delete own message attachments"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'message-attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
);

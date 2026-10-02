-- Increase the private messaging attachment limit from 10 MB to 25 MB.
-- Run once in the Supabase SQL Editor.

update storage.buckets
set file_size_limit = 26214400
where id = 'message-attachments';

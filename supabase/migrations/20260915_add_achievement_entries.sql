-- Repeatable achievement cards for student profiles.
-- research_tools is intentionally left in place for backward compatibility,
-- but the student profile no longer reads from or writes to that column.

alter table public.profiles
  add column if not exists achievement_entries jsonb not null default '[]'::jsonb;

comment on column public.profiles.achievement_entries is
  'Student achievement entries: title, issuer, date, description, and optional credential link.';
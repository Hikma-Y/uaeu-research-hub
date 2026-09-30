-- Let active faculty members view student research ideas in the Faculty portal.
-- Run this once in Supabase SQL Editor after the research_ideas table exists.
-- This script does not change tables or existing idea records.

drop policy if exists "Faculty view research ideas" on public.research_ideas;

create policy "Faculty view research ideas"
on public.research_ideas
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'faculty'
      and coalesce(profiles.account_status, 'active') = 'active'
  )
);

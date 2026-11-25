-- Allow a signed-in student to delete only their own applications and ideas.
-- Run this once in Supabase SQL Editor. It does not delete any records.

grant delete on table public.applications to authenticated;
grant delete on table public.research_ideas to authenticated;

drop policy if exists "Students delete own applications" on public.applications;

create policy "Students delete own applications"
on public.applications
for delete
using (
  student_id = auth.uid()
);

drop policy if exists "Students delete own research ideas" on public.research_ideas;

create policy "Students delete own research ideas"
on public.research_ideas
for delete
using (
  student_id = auth.uid()
);

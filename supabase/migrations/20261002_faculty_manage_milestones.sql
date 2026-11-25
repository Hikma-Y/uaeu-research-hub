-- Preserve admin permissions and allow faculty to manage their own project milestones.
drop policy if exists "Faculty manage own project milestones" on public.project_milestones;
create policy "Faculty manage own project milestones"
on public.project_milestones
for all
to authenticated
using (
  public.current_profile_role() = 'faculty'
  and exists (
    select 1 from public.research_opportunities project
    where project.id::text = project_milestones.opportunity_id
      and project.owner_id = auth.uid()
  )
)
with check (
  public.current_profile_role() = 'faculty'
  and exists (
    select 1 from public.research_opportunities project
    where project.id::text = project_milestones.opportunity_id
      and project.owner_id = auth.uid()
  )
);

grant select, insert, update, delete on public.project_milestones to authenticated;

-- Release an idea for adoption again while preserving the existing project.
create or replace function public.remove_research_idea_adoption(p_idea_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  idea public.research_ideas%rowtype;
begin
  if public.current_profile_role() is distinct from 'faculty' then
    raise exception 'Only faculty accounts can remove adoptions.' using errcode = '42501';
  end if;

  select * into idea from public.research_ideas where id = p_idea_id for update;
  if not found then
    raise exception 'Research idea not found.' using errcode = 'P0001';
  end if;
  if idea.adopted_by is distinct from auth.uid() then
    raise exception 'You can remove only your own adoption.' using errcode = '42501';
  end if;

  update public.research_ideas
  set adopted_by = null, adopted_at = null, adopted_project_id = null
  where id = p_idea_id;
end;
$$;

revoke all on function public.remove_research_idea_adoption(bigint) from public;
grant execute on function public.remove_research_idea_adoption(bigint) to authenticated;

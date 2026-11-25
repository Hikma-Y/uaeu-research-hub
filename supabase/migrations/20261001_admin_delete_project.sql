-- Admin-only, atomic project deletion. Related applications and project group
-- data cascade from the project; older milestone records are removed here.

create or replace function public.admin_delete_project(p_opportunity_id text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  deleted_count integer;
begin
  if public.current_profile_role() is distinct from 'admin' then
    raise exception 'Only administrators can delete projects.' using errcode = '42501';
  end if;

  delete from public.project_milestones
  where opportunity_id::text = p_opportunity_id;

  delete from public.research_opportunities
  where id::text = p_opportunity_id;
  get diagnostics deleted_count = row_count;

  if deleted_count = 0 then
    raise exception 'Project not found.' using errcode = 'P0001';
  end if;
end;
$$;

grant execute on function public.admin_delete_project(text) to authenticated;
notify pgrst, 'reload schema';

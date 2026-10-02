-- Remove a registration and any invitation/group membership together.
begin;

create or replace function public.remove_project_student(p_opportunity_id text, p_student_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  project public.research_opportunities%rowtype;
begin
  if auth.uid() is null or public.current_profile_role() is distinct from 'faculty' then
    raise exception 'Only faculty accounts can remove project students.' using errcode = '42501';
  end if;
  select * into project from public.research_opportunities
  where id = p_opportunity_id for update;
  if not found or project.owner_id is distinct from auth.uid() then
    raise exception 'You can remove students only from your own projects.' using errcode = '42501';
  end if;

  delete from public.applications
  where opportunity_id = p_opportunity_id and student_id::text = p_student_id::text;
  if not found then
    raise exception 'This student is no longer registered for this project.';
  end if;
  delete from public.project_invitations
  where opportunity_id = p_opportunity_id and student_id = p_student_id;
  delete from public.project_message_group_members member
  using public.project_message_groups chat
  where member.group_id = chat.id and chat.opportunity_id = p_opportunity_id
    and member.profile_id = p_student_id;
end;
$$;

revoke all on function public.remove_project_student(text, uuid) from public, anon;
grant execute on function public.remove_project_student(text, uuid) to authenticated;
notify pgrst, 'reload schema';
commit;

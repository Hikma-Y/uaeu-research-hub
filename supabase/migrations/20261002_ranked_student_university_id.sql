-- Include university IDs in the owner-authorized student ranking response.
begin;

drop function if exists public.get_ranked_students_for_project(text);
create or replace function public.get_ranked_students_for_project(p_opportunity_id text)
returns table (
  student_id uuid,
  full_name text,
  major text,
  department text,
  gpa numeric,
  skills text[],
  research_interests text[],
  invitation_status text,
  university_id text
)
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from public.research_opportunities
    where id = p_opportunity_id and owner_id = auth.uid()
  ) then
    raise exception 'Only the project owner can view student rankings.' using errcode = '42501';
  end if;

  return query
    select p.id, p.full_name, p.major, p.department, p.gpa,
      coalesce(p.skills, '{}'::text[]),
      coalesce(p.research_interests, '{}'::text[]),
      invitation.status, p.university_id::text
    from public.profiles p
    left join public.project_invitations invitation
      on invitation.opportunity_id = p_opportunity_id
      and invitation.student_id = p.id
    where p.role = 'student'
      and coalesce(p.account_status, 'active') = 'active'
    order by p.gpa desc nulls last, p.full_name asc nulls last;
end;
$$;

grant execute on function public.get_ranked_students_for_project(text) to authenticated;

commit;

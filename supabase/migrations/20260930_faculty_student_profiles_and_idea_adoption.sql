-- Faculty can view academic student profiles relevant to applications and ideas,
-- and turn one unadopted idea into a private project draft.

alter table public.research_ideas
  add column if not exists adopted_by uuid references public.profiles(id) on delete set null,
  add column if not exists adopted_at timestamptz,
  add column if not exists adopted_project_id text references public.research_opportunities(id) on delete set null;

-- Some deployments use text and others UUID for applications.student_id.
-- Accept text here so the browser can pass an applicant ID straight from
-- faculty_project_applications, then compare both forms safely as text.
drop function if exists public.get_student_profile_for_faculty(uuid);
drop function if exists public.get_student_profile_for_faculty(text);

create function public.get_student_profile_for_faculty(p_student_id text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare result jsonb;
begin
  if public.current_profile_role() is distinct from 'faculty' then
    raise exception 'Only faculty accounts can view student profiles.' using errcode = '42501';
  end if;

  -- A faculty member may inspect a student who applied to one of their own
  -- projects.  Idea authors are also included because the Faculty Ideas page
  -- exposes those ideas to faculty for review.
  if not exists (
    select 1
    from public.applications application
    join public.research_opportunities opportunity
      on opportunity.id = application.opportunity_id
    where application.student_id::text = p_student_id
      and opportunity.owner_id = auth.uid()
  ) and not exists (
    select 1
    from public.research_ideas idea
    where idea.student_id::text = p_student_id
  ) then
    raise exception 'You can view profiles only for students relevant to your projects or ideas.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'full_name', full_name, 'headline', headline, 'bio', bio, 'major', major,
    'department', department, 'year_of_study', year_of_study, 'gpa', gpa,
    'skills', skills, 'research_interests', research_interests
  ) into result
  from public.profiles
  where id::text = p_student_id and role = 'student';
  if result is null then raise exception 'Student profile not found.' using errcode = 'P0001'; end if;
  return result;
end;
$$;

drop function if exists public.adopt_research_idea(uuid);
drop function if exists public.adopt_research_idea(text);

create or replace function public.adopt_research_idea(p_idea_id bigint)
returns text
language plpgsql security definer set search_path = public
as $$
declare idea public.research_ideas%rowtype; faculty public.profiles%rowtype; new_project_id text;
begin
  if public.current_profile_role() is distinct from 'faculty' then raise exception 'Only faculty accounts can adopt ideas.' using errcode = '42501'; end if;
  select * into idea from public.research_ideas where id = p_idea_id for update;
  if not found then raise exception 'Research idea not found.' using errcode = 'P0001'; end if;
  if idea.adopted_by is not null then raise exception 'This research idea has already been adopted.' using errcode = 'P0001'; end if;
  select * into faculty from public.profiles where id = auth.uid();
  insert into public.research_opportunities (owner_id, title, type, department, description, supervisor, visibility, student_capacity)
  values (auth.uid(), idea.title, coalesce(idea.category, 'Research idea'), coalesce(faculty.department, 'Not set'), idea.description, coalesce(faculty.full_name, 'Faculty member'), 'draft', 1)
  returning id into new_project_id;
  update public.research_ideas set adopted_by = auth.uid(), adopted_at = now(), adopted_project_id = new_project_id where id = p_idea_id;
  return new_project_id;
end;
$$;

-- Rebuild the faculty-facing application list with the applicant identity.
-- This is intentionally a view rather than a browser-side profile lookup, so
-- RLS never exposes profiles for students outside the faculty member's projects.
create or replace view public.faculty_project_applications
with (security_barrier = true)
as
  select
    application.id,
    application.student_id,
    application.opportunity_id,
    application.status,
    application.created_at,
    application.updated_at,
    opportunity.title as project_title,
    profile.full_name as student_name,
    profile.major as student_major,
    profile.department as student_department
  from public.applications application
  join public.research_opportunities opportunity
    on opportunity.id = application.opportunity_id
  join public.profiles profile
    on profile.id::text = application.student_id::text
  where opportunity.owner_id = auth.uid()
    and public.current_profile_role() = 'faculty';

grant execute on function public.get_student_profile_for_faculty(text) to authenticated;
grant execute on function public.adopt_research_idea(bigint) to authenticated;
grant select on public.faculty_project_applications to authenticated;

-- Lets idea viewers see only the name of the faculty member who adopted an idea.
create or replace view public.adopted_idea_faculty
with (security_invoker = false)
as
select idea.id as idea_id, faculty.full_name as faculty_name
from public.research_ideas idea
join public.profiles faculty on faculty.id = idea.adopted_by
where idea.adopted_by is not null;

grant select on public.adopted_idea_faculty to authenticated;

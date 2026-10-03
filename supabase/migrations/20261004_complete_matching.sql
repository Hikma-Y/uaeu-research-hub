-- Complete matching support for the UAEU Research Hub.
--
-- Run this once AFTER the existing project, invitation, profile, and private
-- invitation migrations. It is safe to run on the current text-ID project
-- schema. It adds one optional project field and replaces only the matching /
-- invitation / application RPCs listed below.

begin;

-- An optional, explicit hard eligibility rule. When blank, GPA is used only as
-- one transparent scoring factor. When set, students below it cannot apply or
-- be invited, even if a browser request is manually changed.
alter table public.research_opportunities
  add column if not exists minimum_gpa numeric(3, 2);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'research_opportunities_minimum_gpa_check'
      and conrelid = 'public.research_opportunities'::regclass
  ) then
    alter table public.research_opportunities
      add constraint research_opportunities_minimum_gpa_check
      check (minimum_gpa is null or (minimum_gpa >= 0 and minimum_gpa <= 4));
  end if;
end;
$$;

-- Private candidate data is exposed only to the faculty owner of the selected
-- project. The matching service receives these fields from the browser; it has
-- no Supabase key or database connection.
-- The older optional matching setup returned fewer fields, so drop that
-- return-table signature before creating the expanded secure RPC.
drop function if exists public.get_match_candidates_for_project(text);
create or replace function public.get_match_candidates_for_project(
  p_opportunity_id text
)
returns table (
  student_id uuid,
  full_name text,
  major text,
  department text,
  gpa numeric,
  skills text[],
  research_interests text[],
  relevant_coursework text[],
  research_tools text[],
  has_research_experience boolean,
  research_experience text,
  bio text,
  experience_entries jsonb,
  invitation_status text,
  university_id text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_profile_role() is distinct from 'faculty' or not exists (
    select 1
    from public.research_opportunities
    where id = p_opportunity_id
      and owner_id = auth.uid()
  ) then
    raise exception 'Only the project owner can view matching candidates.'
      using errcode = '42501';
  end if;

  return query
    select
      p.id,
      p.full_name,
      p.major,
      p.department,
      p.gpa,
      coalesce(p.skills, '{}'::text[]),
      coalesce(p.research_interests, '{}'::text[]),
      coalesce(p.relevant_coursework, '{}'::text[]),
      coalesce(p.research_tools, '{}'::text[]),
      coalesce(p.has_research_experience, false),
      p.research_experience,
      p.bio,
      coalesce(p.experience_entries, '[]'::jsonb),
      invitation.status,
      p.university_id
    from public.profiles p
    left join public.project_invitations invitation
      on invitation.opportunity_id = p_opportunity_id
      and invitation.student_id = p.id
    where p.role = 'student'
      and coalesce(p.account_status, 'active') = 'active'
    order by lower(coalesce(p.full_name, '')), p.id;
end;
$$;

revoke all on function public.get_match_candidates_for_project(text) from public, anon;
grant execute on function public.get_match_candidates_for_project(text) to authenticated;

-- The student directory returns just enough faculty profile information for
-- supervisor recommendations. It preserves browsing access while allowing the
-- matching UI to show a faculty member's availability honestly.
-- The previous directory RPC returned fewer columns, so its return-table
-- signature must be replaced rather than merely overwritten.
drop function if exists public.get_faculty_directory();
create or replace function public.get_faculty_directory()
returns table (
  id text,
  full_name text,
  department text,
  research_experience text,
  research_interests text[],
  skills text[],
  supervision_status text,
  supervision_capacity integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.current_profile_role() is distinct from 'student' then
    raise exception 'Only student accounts can browse this faculty directory.' using errcode = '42501';
  end if;

  return query
  select
    p.id::text,
    p.full_name::text,
    p.department::text,
    p.research_experience::text,
    coalesce(p.research_interests, '{}'::text[]),
    coalesce(p.skills, '{}'::text[]),
    coalesce(p.supervision_status, 'available')::text,
    coalesce(p.supervision_capacity, 0)::integer
  from public.profiles p
  where p.role = 'faculty'
    and coalesce(p.account_status, 'active') = 'active'
  order by lower(coalesce(p.full_name, '')), p.id;
end;
$$;

revoke all on function public.get_faculty_directory() from public, anon;
grant execute on function public.get_faculty_directory() to authenticated;

-- Enforce the same minimum-GPA rule when a faculty member sends invitations.
-- This prevents bypassing the UI by calling the RPC directly.
create or replace function public.invite_ranked_students(
  p_opportunity_id text,
  p_student_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  locked_opportunity public.research_opportunities%rowtype;
begin
  if auth.uid() is null or public.current_profile_role() is distinct from 'faculty' then
    raise exception 'Only faculty accounts can send invitations.' using errcode = '42501';
  end if;

  select * into locked_opportunity
  from public.research_opportunities
  where id = p_opportunity_id
    and owner_id = auth.uid()
  for update;

  if not found then
    raise exception 'Only the project owner can send invitations.' using errcode = '42501';
  end if;

  if locked_opportunity.minimum_gpa is not null and exists (
    select 1
    from public.profiles p
    where p.id = any(p_student_ids)
      and p.role = 'student'
      and coalesce(p.account_status, 'active') = 'active'
      and (p.gpa is null or p.gpa < locked_opportunity.minimum_gpa)
  ) then
    raise exception 'One or more selected students do not meet the project minimum GPA of %.', locked_opportunity.minimum_gpa
      using errcode = '23514';
  end if;

  insert into public.project_invitations (
    opportunity_id, student_id, faculty_id, status, student_response, updated_at
  )
  select p_opportunity_id, p.id, auth.uid(), 'Pending', null, now()
  from public.profiles p
  where p.id = any(p_student_ids)
    and p.role = 'student'
    and coalesce(p.account_status, 'active') = 'active'
    and (locked_opportunity.minimum_gpa is null or p.gpa >= locked_opportunity.minimum_gpa)
  on conflict (opportunity_id, student_id) do update
    set faculty_id = excluded.faculty_id,
        status = 'Pending',
        student_response = null,
        updated_at = now()
    where public.project_invitations.status <> 'Accepted';
end;
$$;

revoke all on function public.invite_ranked_students(text, uuid[]) from public, anon;
grant execute on function public.invite_ranked_students(text, uuid[]) to authenticated;

-- A private invitation creates an accepted application without calling the
-- public-application RPC. Re-check minimum GPA here in case a faculty member
-- raises a project threshold after the invitation was sent.
create or replace function public.respond_to_project_invitation(
  p_invitation_id uuid,
  p_status text,
  p_student_response text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  project_id text;
  project public.research_opportunities%rowtype;
  invitation public.project_invitations%rowtype;
  membership public.applications%rowtype;
  existing_membership boolean;
  reserved_places integer;
  student_gpa numeric;
begin
  if auth.uid() is null or public.current_profile_role() is distinct from 'student' then
    raise exception 'Only students can respond to project invitations.' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('Accepted', 'Rejected') then
    raise exception 'Choose Accepted or Rejected.' using errcode = '22023';
  end if;

  select i.opportunity_id into project_id from public.project_invitations i
  where i.id = p_invitation_id and i.student_id = auth.uid();
  if not found then
    raise exception 'This invitation is not available to you.' using errcode = '42501';
  end if;

  select * into project from public.research_opportunities
  where id = project_id for update;
  if not found then
    raise exception 'This project is no longer available.';
  end if;
  select * into invitation from public.project_invitations
  where id = p_invitation_id and student_id = auth.uid() for update;
  if not found then
    raise exception 'This invitation is not available to you.' using errcode = '42501';
  end if;
  if invitation.status = p_status then
    return;
  end if;
  if invitation.status <> 'Pending' then
    raise exception 'This invitation has already been answered.';
  end if;
  if invitation.faculty_id is distinct from project.owner_id then
    raise exception 'This invitation is no longer valid.';
  end if;

  if p_status = 'Accepted' and project.minimum_gpa is not null then
    select p.gpa into student_gpa from public.profiles p where p.id = auth.uid();
    if student_gpa is null then
      raise exception 'Add your GPA before accepting: this project requires a minimum GPA of %.', project.minimum_gpa
        using errcode = '23514';
    end if;
    if student_gpa < project.minimum_gpa then
      raise exception 'This project requires a minimum GPA of %; your current GPA is %.', project.minimum_gpa, student_gpa
        using errcode = '23514';
    end if;
  end if;

  if p_status = 'Accepted' then
    select * into membership from public.applications a
    where a.opportunity_id = project_id and a.student_id::text = auth.uid()::text
    for update;
    existing_membership := found;

    if not existing_membership or coalesce(membership.status, 'Submitted') = 'Rejected' then
      select count(*)::integer into reserved_places from public.applications a
      where a.opportunity_id = project_id
        and coalesce(a.status, 'Submitted') <> 'Rejected';
      if reserved_places >= project.student_capacity then
        raise exception 'This project is full. Ask the faculty member to increase its capacity.';
      end if;
    end if;

    if existing_membership then
      update public.applications set status = 'Accepted', updated_at = now()
      where id = membership.id;
    else
      membership.student_id := auth.uid();
      membership.opportunity_id := project_id;
      insert into public.applications (student_id, opportunity_id, status)
      values (membership.student_id, membership.opportunity_id, 'Accepted');
    end if;

    insert into public.project_message_group_members (group_id, profile_id, invited_by)
    select g.id, auth.uid(), project.owner_id
    from public.project_message_groups g where g.opportunity_id = project_id
    on conflict do nothing;
  end if;

  update public.project_invitations
  set status = p_status,
      student_response = case when p_status = 'Rejected'
        then nullif(btrim(p_student_response), '') else null end,
      updated_at = now()
  where id = p_invitation_id;
end;
$$;

revoke all on function public.respond_to_project_invitation(uuid, text, text) from public, anon;
grant execute on function public.respond_to_project_invitation(uuid, text, text) to authenticated;

-- Enforce GPA eligibility when a student submits a public-project application.
-- This keeps the server authoritative if a browser is stale or modified.
create or replace function public.apply_to_research_opportunity(
  p_opportunity_id text
)
returns public.applications
language plpgsql
security definer
set search_path = public
as $$
declare
  current_student_id uuid := auth.uid();
  locked_opportunity public.research_opportunities%rowtype;
  student_gpa numeric;
  reserved_places integer;
  inserted_application public.applications%rowtype;
begin
  if current_student_id is null then
    raise exception 'You must be signed in to apply.' using errcode = '42501';
  end if;
  if public.current_profile_role() is distinct from 'student' then
    raise exception 'Only student accounts can apply to research projects.' using errcode = '42501';
  end if;

  select * into locked_opportunity
  from public.research_opportunities
  where id = p_opportunity_id
  for update;

  if not found or locked_opportunity.visibility <> 'public' then
    raise exception 'This project is not available for applications.' using errcode = 'P0001';
  end if;
  if locked_opportunity.deadline is not null and locked_opportunity.deadline < current_date then
    raise exception 'The application deadline for this project has passed.' using errcode = 'P0001';
  end if;

  if locked_opportunity.minimum_gpa is not null then
    select p.gpa into student_gpa from public.profiles p where p.id = current_student_id;
    if student_gpa is null then
      raise exception 'Add your GPA before applying: this project requires a minimum GPA of %.', locked_opportunity.minimum_gpa
        using errcode = '23514';
    end if;
    if student_gpa < locked_opportunity.minimum_gpa then
      raise exception 'This project requires a minimum GPA of %; your current GPA is %.', locked_opportunity.minimum_gpa, student_gpa
        using errcode = '23514';
    end if;
  end if;

  if exists (
    select 1 from public.applications application
    where application.opportunity_id = p_opportunity_id
      and application.student_id = current_student_id
  ) then
    raise exception 'You have already applied to this project.' using errcode = '23505';
  end if;

  select count(*)::integer into reserved_places
  from public.applications application
  where application.opportunity_id = p_opportunity_id
    and coalesce(application.status, 'Submitted') <> 'Rejected';

  if reserved_places >= locked_opportunity.student_capacity then
    raise exception 'This project is full.' using errcode = 'P0001';
  end if;

  insert into public.applications (student_id, opportunity_id, status)
  values (current_student_id, p_opportunity_id, 'Submitted')
  returning * into inserted_application;
  return inserted_application;
end;
$$;

revoke all on function public.apply_to_research_opportunity(text) from anon;
grant execute on function public.apply_to_research_opportunity(text) to authenticated;

-- Do not accept an older submitted application if its project was later given
-- a higher minimum GPA. Faculty can still reject it normally.
create or replace function public.review_research_application(
  p_application_id bigint,
  p_decision text
)
returns public.applications
language plpgsql
security definer
set search_path = public
as $$
declare
  current_faculty_id uuid := auth.uid();
  application_opportunity_id text;
  locked_opportunity public.research_opportunities%rowtype;
  locked_application public.applications%rowtype;
  student_gpa numeric;
begin
  if current_faculty_id is null then
    raise exception 'You must be signed in to review an application.' using errcode = '42501';
  end if;
  if public.current_profile_role() is distinct from 'faculty' then
    raise exception 'Only faculty accounts can review applications.' using errcode = '42501';
  end if;
  if p_decision not in ('Accepted', 'Rejected') then
    raise exception 'A review decision must be Accepted or Rejected.' using errcode = '22023';
  end if;

  select application.opportunity_id into application_opportunity_id
  from public.applications application where application.id = p_application_id;
  if not found then
    raise exception 'This application no longer exists.' using errcode = 'P0001';
  end if;

  select * into locked_opportunity from public.research_opportunities opportunity
  where opportunity.id = application_opportunity_id for update;
  if not found or locked_opportunity.owner_id <> current_faculty_id then
    raise exception 'You can review applications only for your own projects.' using errcode = '42501';
  end if;

  select * into locked_application from public.applications application
  where application.id = p_application_id for update;
  if locked_application.status is distinct from 'Submitted' then
    raise exception 'This application has already been reviewed.' using errcode = 'P0001';
  end if;

  if p_decision = 'Accepted' and locked_opportunity.minimum_gpa is not null then
    select p.gpa into student_gpa from public.profiles p
    where p.id::text = locked_application.student_id::text;
    if student_gpa is null or student_gpa < locked_opportunity.minimum_gpa then
      raise exception 'This student no longer meets the project minimum GPA of %.', locked_opportunity.minimum_gpa
        using errcode = '23514';
    end if;
  end if;

  update public.applications set status = p_decision, updated_at = now()
  where id = p_application_id returning * into locked_application;
  return locked_application;
end;
$$;

revoke all on function public.review_research_application(bigint, text) from anon;
grant execute on function public.review_research_application(bigint, text) to authenticated;

notify pgrst, 'reload schema';
commit;

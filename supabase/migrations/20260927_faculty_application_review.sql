-- UAEU Research Hub compatibility fix for this existing schema.
-- Confirmed types: projects.id/text; applications.opportunity_id/text;
-- applications.id/bigint; student_id, owner_id and profile.id/uuid.
-- Run this AFTER the two earlier 20260927 workflow queries.

create or replace view public.public_research_opportunities
with (security_barrier = true)
as
  select opportunity.*,
    greatest(
      opportunity.student_capacity - count(application.id) filter (
        where coalesce(application.status, 'Submitted') <> 'Rejected'
      )::integer,
      0
    ) as remaining_slots
  from public.research_opportunities opportunity
  left join public.applications application
    on application.opportunity_id = opportunity.id
  where opportunity.visibility = 'public'
  group by opportunity.id;

create or replace function public.protect_reserved_project_places()
returns trigger language plpgsql security definer set search_path = public
as $$
declare reserved_places integer;
begin
  if new.student_capacity < old.student_capacity
    or (new.visibility = 'draft' and old.visibility = 'public') then
    select count(*)::integer into reserved_places
    from public.applications application
    where application.opportunity_id = old.id
      and coalesce(application.status, 'Submitted') <> 'Rejected';

    if new.student_capacity < reserved_places then
      raise exception 'Student capacity cannot be lower than the number of reserved places.' using errcode = '23514';
    end if;
    if new.visibility = 'draft' and old.visibility = 'public' and reserved_places > 0 then
      raise exception 'A project with applications cannot be changed back to a private draft.' using errcode = '23514';
    end if;
  end if;
  new.updated_at = now();
  return new;
end;
$$;

drop function if exists public.apply_to_research_opportunity(uuid);

create function public.apply_to_research_opportunity(p_opportunity_id text)
returns public.applications
language plpgsql security definer set search_path = public
as $$
declare
  current_student_id uuid := auth.uid();
  locked_opportunity public.research_opportunities%rowtype;
  reserved_places integer;
  inserted_application public.applications%rowtype;
begin
  if current_student_id is null then
    raise exception 'You must be signed in to apply.' using errcode = '42501';
  end if;
  if public.current_profile_role() is distinct from 'student' then
    raise exception 'Only student accounts can apply to research projects.' using errcode = '42501';
  end if;

  select * into locked_opportunity from public.research_opportunities
  where id = p_opportunity_id for update;

  if not found or locked_opportunity.visibility <> 'public' then
    raise exception 'This project is not available for applications.' using errcode = 'P0001';
  end if;
  if locked_opportunity.deadline is not null and locked_opportunity.deadline < current_date then
    raise exception 'The application deadline for this project has passed.' using errcode = 'P0001';
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

create or replace view public.faculty_project_applications
with (security_barrier = true)
as
  select application.id, application.student_id, application.opportunity_id,
    application.status, application.created_at, application.updated_at,
    opportunity.title as project_title, profile.full_name as student_name
  from public.applications application
  join public.research_opportunities opportunity
    on opportunity.id = application.opportunity_id
  join public.profiles profile on profile.id = application.student_id
  where opportunity.owner_id = auth.uid()
    and public.current_profile_role() = 'faculty';

drop function if exists public.review_research_application(uuid, text);

create function public.review_research_application(
  p_application_id bigint,
  p_decision text
)
returns public.applications
language plpgsql security definer set search_path = public
as $$
declare
  current_faculty_id uuid := auth.uid();
  application_opportunity_id text;
  locked_opportunity public.research_opportunities%rowtype;
  locked_application public.applications%rowtype;
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

  update public.applications set status = p_decision, updated_at = now()
  where id = p_application_id returning * into locked_application;
  return locked_application;
end;
$$;

revoke all on function public.apply_to_research_opportunity(text) from anon;
grant execute on function public.apply_to_research_opportunity(text) to authenticated;
revoke all on function public.review_research_application(bigint, text) from anon;
grant execute on function public.review_research_application(bigint, text) to authenticated;
grant select on public.faculty_project_applications to authenticated;

notify pgrst, 'reload schema';
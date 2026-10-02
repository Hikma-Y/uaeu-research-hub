-- Compatibility fix for installations where applications.student_id was
-- originally created as text rather than uuid.
-- Run this AFTER the two 20260927 workflow migrations.

-- The original applications table in this installation stores a Supabase user
-- UUID as text.  Compare text to text in the student policy and application
-- RPC, otherwise Postgres raises: operator does not exist: text = uuid.
drop policy if exists "students read own applications" on public.applications;

create policy "students read own applications"
on public.applications
for select
to authenticated
using (
  student_id = auth.uid()::text
  and public.current_profile_role() = 'student'
);

create or replace function public.apply_to_research_opportunity(
  p_opportunity_id uuid
)
returns public.applications
language plpgsql
security definer
set search_path = public
as $$
declare
  current_student_id text := auth.uid()::text;
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

  select *
  into locked_opportunity
  from public.research_opportunities
  where id = p_opportunity_id
  for update;

  if not found or locked_opportunity.visibility <> 'public' then
    raise exception 'This project is not available for applications.' using errcode = 'P0001';
  end if;

  if locked_opportunity.deadline is not null
    and locked_opportunity.deadline < current_date then
    raise exception 'The application deadline for this project has passed.' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.applications application
    where application.opportunity_id = p_opportunity_id
      and application.student_id = current_student_id
  ) then
    raise exception 'You have already applied to this project.' using errcode = '23505';
  end if;

  select count(*)::integer
  into reserved_places
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

-- Faculty application list: profiles.id is uuid, while application.student_id
-- is text in this existing schema.  Cast the profile ID for a safe join.
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

grant execute on function public.apply_to_research_opportunity(uuid) to authenticated;
grant select on public.faculty_project_applications to authenticated;

notify pgrst, 'reload schema';

-- GPA-based pre-publication student invitations.
-- Run once in Supabase SQL Editor. It uses the existing text project IDs.

create table if not exists public.project_invitations (
  id uuid primary key default gen_random_uuid(),
  opportunity_id text not null,
  student_id uuid not null references public.profiles(id) on delete cascade,
  faculty_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'Pending' check (status in ('Pending', 'Accepted', 'Rejected')),
  student_response text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (opportunity_id, student_id)
);

create index if not exists project_invitations_student_idx
  on public.project_invitations (student_id, created_at desc);
create index if not exists project_invitations_faculty_idx
  on public.project_invitations (faculty_id, opportunity_id);

alter table public.project_invitations enable row level security;
grant select, update on public.project_invitations to authenticated;

drop policy if exists "Faculty read own project invitations" on public.project_invitations;
create policy "Faculty read own project invitations"
on public.project_invitations for select
using (faculty_id = auth.uid());

drop policy if exists "Students read own project invitations" on public.project_invitations;
create policy "Students read own project invitations"
on public.project_invitations for select
using (student_id = auth.uid());

drop policy if exists "Students respond to own project invitations" on public.project_invitations;
create policy "Students respond to own project invitations"
on public.project_invitations for update
using (student_id = auth.uid())
with check (student_id = auth.uid() and status in ('Pending', 'Accepted', 'Rejected'));

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

create or replace function public.invite_ranked_students(
  p_opportunity_id text,
  p_student_ids uuid[]
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from public.research_opportunities
    where id = p_opportunity_id and owner_id = auth.uid()
  ) then
    raise exception 'Only the project owner can send invitations.' using errcode = '42501';
  end if;

  insert into public.project_invitations (
    opportunity_id, student_id, faculty_id, status, student_response, updated_at
  )
  select p_opportunity_id, p.id, auth.uid(), 'Pending', null, now()
  from public.profiles p
  where p.id = any(p_student_ids)
    and p.role = 'student'
    and coalesce(p.account_status, 'active') = 'active'
  on conflict (opportunity_id, student_id) do update
    set faculty_id = excluded.faculty_id,
        status = case when project_invitations.status = 'Accepted' then 'Accepted' else 'Pending' end,
        student_response = case when project_invitations.status = 'Accepted' then project_invitations.student_response else null end,
        updated_at = now();
end;
$$;

create or replace function public.get_my_project_invitations()
returns table (
  invitation_id uuid,
  opportunity_id text,
  project_title text,
  project_description text,
  faculty_id uuid,
  faculty_name text,
  status text,
  student_response text,
  created_at timestamptz
)
language sql security definer set search_path = public
as $$
  select invitation.id, invitation.opportunity_id, project.title, project.description,
    invitation.faculty_id, faculty.full_name, invitation.status,
    invitation.student_response, invitation.created_at
  from public.project_invitations invitation
  join public.research_opportunities project on project.id = invitation.opportunity_id
  join public.profiles faculty on faculty.id = invitation.faculty_id
  where invitation.student_id = auth.uid()
  order by case invitation.status when 'Pending' then 0 else 1 end, invitation.created_at desc;
$$;

grant execute on function public.get_ranked_students_for_project(text) to authenticated;
grant execute on function public.invite_ranked_students(text, uuid[]) to authenticated;
grant execute on function public.get_my_project_invitations() to authenticated;

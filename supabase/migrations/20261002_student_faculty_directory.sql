-- Expose only faculty research details needed by the student directory.
create or replace function public.get_faculty_directory()
returns table (
  id text,
  full_name text,
  department text,
  research_experience text,
  research_interests text[],
  skills text[]
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
  select p.id::text, p.full_name::text, p.department::text,
    p.research_experience::text, p.research_interests, p.skills
  from public.profiles p
  where p.role = 'faculty'
    and coalesce(p.account_status, 'active') = 'active'
  order by lower(coalesce(p.full_name, '')), p.id;
end;
$$;

revoke all on function public.get_faculty_directory() from public, anon;
grant execute on function public.get_faculty_directory() to authenticated;

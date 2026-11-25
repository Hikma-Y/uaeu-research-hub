-- Append university IDs without changing the existing directory columns.
create or replace view public.message_directory
with (security_barrier = true) as
select id,
  case when role = 'admin' then 'Research Systems Administrator' else full_name end as full_name,
  role, department,
  case when role in ('student', 'faculty') then email else null end as email,
  case when role in ('student', 'faculty') then university_id else null end as university_id
from public.profiles
where coalesce(account_status, 'active') = 'active';

grant select on public.message_directory to authenticated;

create or replace function public.remove_message_group_member(p_group_id uuid, p_member_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_project_group_member(p_group_id) or not exists (
    select 1 from public.project_message_groups
    where id = p_group_id and created_by = auth.uid()
  ) then
    raise exception 'Only the group creator can remove members.' using errcode = '42501';
  end if;
  if p_member_id = auth.uid() then
    raise exception 'Use Leave group to remove yourself.' using errcode = '22023';
  end if;
  delete from public.project_message_group_members
  where group_id = p_group_id and profile_id = p_member_id;
end;
$$;

revoke all on function public.remove_message_group_member(uuid, uuid) from public;
grant execute on function public.remove_message_group_member(uuid, uuid) to authenticated;
notify pgrst, 'reload schema';

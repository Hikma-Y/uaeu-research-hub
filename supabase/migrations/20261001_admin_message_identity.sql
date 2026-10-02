-- Keep individual administrator names private in all messaging surfaces.
-- The shared support identity is used for every active administrator.

create or replace view public.message_directory
with (security_barrier = true)
as
select
  id,
  case
    when role = 'admin' then 'Research Systems Administrator'
    else full_name
  end as full_name,
  role,
  department,
  case
    when role in ('student', 'faculty') then email
    else null
  end as email
from public.profiles
where coalesce(account_status, 'active') = 'active';

grant select on public.message_directory to authenticated;
notify pgrst, 'reload schema';

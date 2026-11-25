-- Extend identity protection while allowing updates to other profile fields.
create or replace function public.protect_profile_identity_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.full_name is distinct from old.full_name
      or new.email is distinct from old.email
      or new.university_id is distinct from old.university_id)
    and coalesce(auth.role(), '') <> 'service_role'
    and not public.is_admin() then
    raise exception 'Only administrators may change a user name, email, or university ID'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_profile_identity_fields_trigger on public.profiles;
create trigger protect_profile_identity_fields_trigger
before update on public.profiles
for each row
execute function public.protect_profile_identity_fields();

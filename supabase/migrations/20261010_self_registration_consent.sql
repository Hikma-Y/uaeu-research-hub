-- Run in Supabase SQL Editor before enabling self-registration.
begin;

-- Faculty may omit their ID; student registration still validates it below.
alter table public.profiles alter column university_id drop not null;

alter table public.profiles
  add column if not exists research_background_consent_at timestamptz,
  add column if not exists research_background_consent_version text;

create or replace function public.validate_hub_registration()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Preserve the existing trusted administrator account-creation flow.
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  if new.raw_user_meta_data -> 'research_background_consent' is distinct from 'true'::jsonb
     or new.raw_user_meta_data ->> 'research_background_consent_version' is distinct from 'hub-only-v1' then
    raise exception 'You must accept sharing your research background within UAEU Research Hub before creating an account.';
  end if;
  if coalesce(new.email, '') !~* '^[a-z0-9][^[:space:]@]*@uaeu\.ac\.ae$'
     or btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')) = '' then
    raise exception 'A UAEU email and full name are required.';
  end if;
  -- Derive the role from the email rather than trusting client-supplied metadata.
  new.raw_user_meta_data := jsonb_set(coalesce(new.raw_user_meta_data, '{}'::jsonb), '{role}',
    to_jsonb(case when new.email ~ '^[0-9]' then 'student'::text else 'faculty'::text end));
  if (new.raw_user_meta_data ->> 'role' = 'student'
      or btrim(coalesce(new.raw_user_meta_data ->> 'university_id', '')) <> '')
     and btrim(coalesce(new.raw_user_meta_data ->> 'university_id', '')) !~ '^[0-9]{9}$' then
    raise exception 'Students require a nine-digit university ID. Faculty may omit it; any provided ID must contain nine digits.';
  end if;
  return new;
end;
$$;

create or replace function public.create_hub_registration_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;
  insert into public.profiles (
    id, full_name, email, university_id, role,
    research_background_consent_at, research_background_consent_version
  ) values (
    new.id, btrim(new.raw_user_meta_data ->> 'full_name'), new.email,
    nullif(btrim(new.raw_user_meta_data ->> 'university_id'), ''), new.raw_user_meta_data ->> 'role',
    now(), 'hub-only-v1'
  );
  return new;
end;
$$;

drop trigger if exists validate_hub_registration on auth.users;
create trigger validate_hub_registration
before insert on auth.users
for each row execute function public.validate_hub_registration();

drop trigger if exists create_hub_registration_profile on auth.users;
create trigger create_hub_registration_profile
after insert on auth.users
for each row execute function public.create_hub_registration_profile();

revoke all on function public.validate_hub_registration() from public, anon, authenticated;
revoke all on function public.create_hub_registration_profile() from public, anon, authenticated;
commit;

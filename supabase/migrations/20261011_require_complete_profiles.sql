-- Run after the profile and interaction tables have been set up.
begin;
create or replace function public.require_complete_interaction_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  p jsonb;
  complete boolean;
begin
  if auth.uid() is null or coalesce(auth.role(), '') = 'service_role' then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  select to_jsonb(profile) into p from public.profiles profile where id = auth.uid();
  if p ->> 'role' = 'admin' then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  complete := btrim(coalesce(p ->> 'department', '')) <> ''
    and btrim(coalesce(p ->> case when p ->> 'role' = 'faculty' then 'research_experience' else 'bio' end, '')) <> ''
    and exists (select 1 from jsonb_array_elements_text(coalesce(nullif(p -> 'skills', 'null'::jsonb), '[]'::jsonb)) item where btrim(item) <> '')
    and exists (select 1 from jsonb_array_elements_text(coalesce(nullif(p -> 'research_interests', 'null'::jsonb), '[]'::jsonb)) item where btrim(item) <> '');
  if p ->> 'role' = 'student' then
    complete := complete and btrim(coalesce(p ->> 'major', '')) <> ''
      and btrim(coalesce(p ->> 'year_of_study', '')) <> ''
      and (p ->> 'gpa')::numeric between 0 and 4;
  end if;
  if complete is distinct from true then
    raise exception 'Complete your profile before interacting in UAEU Research Hub.' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array['research_ideas', 'research_opportunities', 'applications', 'project_invitations', 'project_milestones', 'project_message_groups', 'project_message_group_members'] loop
    if to_regclass('public.' || table_name) is not null then
      execute format('drop trigger if exists require_complete_profile on public.%I', table_name);
      execute format('create trigger require_complete_profile before insert or update or delete on public.%I for each row execute function public.require_complete_interaction_profile()', table_name);
    end if;
  end loop;
  -- Read receipts remain available while browsing existing conversations.
  foreach table_name in array array['direct_messages', 'project_group_messages'] loop
    if to_regclass('public.' || table_name) is not null then
      execute format('drop trigger if exists require_complete_profile on public.%I', table_name);
      execute format('create trigger require_complete_profile before insert or delete on public.%I for each row execute function public.require_complete_interaction_profile()', table_name);
    end if;
  end loop;
end;
$$;
revoke all on function public.require_complete_interaction_profile() from public, anon, authenticated;
commit;

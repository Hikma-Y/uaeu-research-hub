-- Ad-hoc group chats created from Messaging. Students can invite students only;
-- faculty can invite both students and faculty.

alter table public.project_message_groups
  alter column opportunity_id drop not null;

create or replace function public.create_message_group(
  p_name text,
  p_member_ids uuid[]
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  group_chat_id uuid;
  creator_role text;
begin
  select role into creator_role from public.profiles where id = auth.uid();
  if creator_role not in ('student', 'faculty') then
    raise exception 'Only student and faculty accounts can create message groups.' using errcode = '42501';
  end if;
  if nullif(trim(p_name), '') is null then
    raise exception 'Enter a group name.' using errcode = '22023';
  end if;
  if creator_role = 'student' and exists (
    select 1 from public.profiles
    where id = any(coalesce(p_member_ids, array[]::uuid[])) and role <> 'student'
  ) then
    raise exception 'Students can add only other students to a group.' using errcode = '42501';
  end if;
  if creator_role = 'faculty' and exists (
    select 1 from public.profiles
    where id = any(coalesce(p_member_ids, array[]::uuid[])) and role not in ('student', 'faculty')
  ) then
    raise exception 'Faculty can add only students and faculty members.' using errcode = '42501';
  end if;

  insert into public.project_message_groups (name, created_by)
  values (trim(p_name), auth.uid())
  returning id into group_chat_id;

  insert into public.project_message_group_members (group_id, profile_id, invited_by, last_seen_at)
  values (group_chat_id, auth.uid(), auth.uid(), now());

  insert into public.project_message_group_members (group_id, profile_id, invited_by)
  select group_chat_id, id, auth.uid()
  from public.profiles
  where id = any(coalesce(p_member_ids, array[]::uuid[]))
    and id <> auth.uid()
  on conflict do nothing;

  return group_chat_id;
end;
$$;

create or replace function public.add_message_group_members(
  p_group_id uuid,
  p_member_ids uuid[]
)
returns void
language plpgsql security definer set search_path = public
as $$
declare creator_role text;
begin
  if not public.is_project_group_member(p_group_id) then
    raise exception 'Only group members can invite people.' using errcode = '42501';
  end if;
  select role into creator_role from public.profiles where id = auth.uid();
  if creator_role = 'student' and exists (select 1 from public.profiles where id = any(coalesce(p_member_ids, array[]::uuid[])) and role <> 'student') then
    raise exception 'Students can add only other students to a group.' using errcode = '42501';
  end if;
  if creator_role = 'faculty' and exists (select 1 from public.profiles where id = any(coalesce(p_member_ids, array[]::uuid[])) and role not in ('student', 'faculty')) then
    raise exception 'Faculty can add only students and faculty members.' using errcode = '42501';
  end if;
  insert into public.project_message_group_members (group_id, profile_id, invited_by)
  select p_group_id, id, auth.uid() from public.profiles
  where id = any(coalesce(p_member_ids, array[]::uuid[]))
  on conflict do nothing;
end;
$$;

grant execute on function public.create_message_group(text, uuid[]) to authenticated;
grant execute on function public.add_message_group_members(uuid, uuid[]) to authenticated;
notify pgrst, 'reload schema';

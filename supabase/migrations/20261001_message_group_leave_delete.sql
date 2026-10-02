-- Members can leave a group themselves. Only the group creator can delete a
-- group for everyone; deleting cascades to its members and messages.

create or replace function public.leave_message_group(p_group_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.project_message_group_members
    where group_id = p_group_id and profile_id = auth.uid()
  ) then
    raise exception 'You are not a member of this group.' using errcode = '42501';
  end if;

  delete from public.project_message_group_members
  where group_id = p_group_id and profile_id = auth.uid();
end;
$$;

create or replace function public.delete_message_group(p_group_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.project_message_groups
    where id = p_group_id and created_by = auth.uid()
  ) then
    raise exception 'Only the group creator can delete this group.' using errcode = '42501';
  end if;

  delete from public.project_message_groups
  where id = p_group_id;
end;
$$;

grant execute on function public.leave_message_group(uuid) to authenticated;
grant execute on function public.delete_message_group(uuid) to authenticated;
notify pgrst, 'reload schema';

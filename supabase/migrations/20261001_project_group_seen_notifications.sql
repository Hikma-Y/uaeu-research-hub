-- Track whether each invited member has opened a project group chat.

alter table public.project_message_group_members
  add column if not exists last_seen_at timestamptz;

create or replace function public.mark_project_group_seen(p_group_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.project_message_group_members
  set last_seen_at = now()
  where group_id = p_group_id and profile_id = auth.uid();
end;
$$;

grant execute on function public.mark_project_group_seen(uuid) to authenticated;

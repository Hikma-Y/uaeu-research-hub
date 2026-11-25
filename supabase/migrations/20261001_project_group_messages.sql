-- Faculty-owned project group chats. Creating a chat automatically adds every
-- accepted student on that project and the project owner.

create table if not exists public.project_message_groups (
  id uuid primary key default gen_random_uuid(),
  opportunity_id text not null unique references public.research_opportunities(id) on delete cascade,
  name text not null,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.project_message_group_members (
  group_id uuid not null references public.project_message_groups(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  invited_by uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz,
  primary key (group_id, profile_id)
);

create table if not exists public.project_group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.project_message_groups(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (nullif(trim(body), '') is not null),
  created_at timestamptz not null default now()
);

create index if not exists project_group_members_profile_idx
  on public.project_message_group_members(profile_id, group_id);
create index if not exists project_group_messages_group_created_idx
  on public.project_group_messages(group_id, created_at);

create or replace function public.is_project_group_member(p_group_id uuid)
returns boolean
language sql security definer set search_path = public
as $$
  select exists (
    select 1 from public.project_message_group_members
    where group_id = p_group_id and profile_id = auth.uid()
  );
$$;

alter table public.project_message_groups enable row level security;
alter table public.project_message_group_members enable row level security;
alter table public.project_group_messages enable row level security;

create policy "Members read project groups" on public.project_message_groups
for select to authenticated using (public.is_project_group_member(id));
create policy "Members read project group members" on public.project_message_group_members
for select to authenticated using (public.is_project_group_member(group_id));
create policy "Members read project group messages" on public.project_group_messages
for select to authenticated using (public.is_project_group_member(group_id));
create policy "Members send project group messages" on public.project_group_messages
for insert to authenticated with check (
  sender_id = auth.uid() and public.is_project_group_member(group_id)
);

grant select on public.project_message_groups, public.project_message_group_members, public.project_group_messages to authenticated;
grant insert on public.project_group_messages to authenticated;
grant execute on function public.is_project_group_member(uuid) to authenticated;

create or replace function public.create_project_group_chat(p_opportunity_id text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  group_chat_id uuid;
  project_title text;
begin
  if public.current_profile_role() is distinct from 'faculty' then
    raise exception 'Only faculty accounts can create project group chats.' using errcode = '42501';
  end if;

  select title into project_title
  from public.research_opportunities
  where id = p_opportunity_id and owner_id = auth.uid();
  if not found then
    raise exception 'You can create a group chat only for your own project.' using errcode = '42501';
  end if;

  insert into public.project_message_groups (opportunity_id, name, created_by)
  values (p_opportunity_id, coalesce(project_title, 'Project') || ' group', auth.uid())
  on conflict (opportunity_id) do update set name = excluded.name
  returning id into group_chat_id;

  insert into public.project_message_group_members (group_id, profile_id, invited_by)
  values (group_chat_id, auth.uid(), auth.uid())
  on conflict do nothing;

  insert into public.project_message_group_members (group_id, profile_id, invited_by)
  select group_chat_id, profile.id, auth.uid()
  from public.applications application
  join public.profiles profile on profile.id::text = application.student_id::text
  where application.opportunity_id = p_opportunity_id
    and application.status = 'Accepted'
  on conflict do nothing;

  return group_chat_id;
end;
$$;

grant execute on function public.create_project_group_chat(text) to authenticated;
notify pgrst, 'reload schema';

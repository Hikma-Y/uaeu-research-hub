-- Requires project_invitations.sql and the existing messaging/project workflow.
begin;

alter table public.direct_messages
  add column if not exists project_invitation_id uuid
    references public.project_invitations(id) on delete set null;

-- Students respond through the RPC; they cannot edit recipients or project IDs.
drop policy if exists "Students respond to own project invitations" on public.project_invitations;
revoke update on public.project_invitations from authenticated;

drop policy if exists "Students read invited private opportunities" on public.research_opportunities;
create policy "Students read invited private opportunities"
on public.research_opportunities for select to authenticated
using (
  public.current_profile_role() = 'student'
  and exists (
    select 1 from public.project_invitations invitation
    where invitation.opportunity_id = research_opportunities.id
      and invitation.student_id = auth.uid()
      and invitation.status in ('Pending', 'Accepted')
  )
);

-- Keep the public view public. This separate view includes only this student's
-- accepted private invitations and computes capacity from all reservations.
create or replace view public.student_research_opportunities
with (security_barrier = true)
as
  select project.*,
    greatest(project.student_capacity - count(application.id) filter (
      where coalesce(application.status, 'Submitted') <> 'Rejected'
    )::integer, 0) as remaining_slots
  from public.research_opportunities project
  left join public.applications application on application.opportunity_id = project.id
  where public.current_profile_role() = 'student'
    and (project.visibility = 'public' or exists (
      select 1 from public.project_invitations invitation
      where invitation.opportunity_id = project.id
        and invitation.student_id = auth.uid()
        and invitation.status = 'Accepted'
    ))
  group by project.id;

revoke all on public.student_research_opportunities from public, anon;
grant select on public.student_research_opportunities to authenticated;

create or replace function public.respond_to_project_invitation(
  p_invitation_id uuid,
  p_status text,
  p_student_response text default null
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  project_id text;
  project public.research_opportunities%rowtype;
  invitation public.project_invitations%rowtype;
  membership public.applications%rowtype;
  existing_membership boolean;
  reserved_places integer;
begin
  if auth.uid() is null or public.current_profile_role() is distinct from 'student' then
    raise exception 'Only students can respond to project invitations.' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('Accepted', 'Rejected') then
    raise exception 'Choose Accepted or Rejected.' using errcode = '22023';
  end if;

  select i.opportunity_id into project_id from public.project_invitations i
  where i.id = p_invitation_id and i.student_id = auth.uid();
  if not found then
    raise exception 'This invitation is not available to you.' using errcode = '42501';
  end if;

  -- Same lock order as application submission and faculty review. Invitations
  -- do not reserve places until accepted, and concurrent acceptances serialize.
  select * into project from public.research_opportunities
  where id = project_id for update;
  if not found then
    raise exception 'This project is no longer available.';
  end if;
  select * into invitation from public.project_invitations
  where id = p_invitation_id and student_id = auth.uid() for update;
  if not found then
    raise exception 'This invitation is not available to you.' using errcode = '42501';
  end if;
  if invitation.status = p_status then
    return;
  end if;
  if invitation.status <> 'Pending' then
    raise exception 'This invitation has already been answered.';
  end if;
  if invitation.faculty_id is distinct from project.owner_id then
    raise exception 'This invitation is no longer valid.';
  end if;

  if p_status = 'Accepted' then
    select * into membership from public.applications a
    where a.opportunity_id = project_id and a.student_id::text = auth.uid()::text
    for update;
    existing_membership := found;

    if not existing_membership or coalesce(membership.status, 'Submitted') = 'Rejected' then
      select count(*)::integer into reserved_places from public.applications a
      where a.opportunity_id = project_id
        and coalesce(a.status, 'Submitted') <> 'Rejected';
      if reserved_places >= project.student_capacity then
        raise exception 'This project is full. Ask the faculty member to increase its capacity.';
      end if;
    end if;

    if existing_membership then
      update public.applications set status = 'Accepted', updated_at = now()
      where id = membership.id;
    else
      -- Row assignments support installations with either text or UUID student IDs.
      membership.student_id := auth.uid();
      membership.opportunity_id := project_id;
      insert into public.applications (student_id, opportunity_id, status)
      values (membership.student_id, membership.opportunity_id, 'Accepted');
    end if;

    -- Join an existing project group, if the faculty member already created it.
    insert into public.project_message_group_members (group_id, profile_id, invited_by)
    select g.id, auth.uid(), project.owner_id
    from public.project_message_groups g where g.opportunity_id = project_id
    on conflict do nothing;
  end if;

  update public.project_invitations
  set status = p_status,
      student_response = case when p_status = 'Rejected'
        then nullif(btrim(p_student_response), '') else null end,
      updated_at = now()
  where id = p_invitation_id;
end;
$$;

revoke all on function public.respond_to_project_invitation(uuid, text, text) from public, anon;
grant execute on function public.respond_to_project_invitation(uuid, text, text) to authenticated;

-- Reconcile invitations accepted before acceptance created project membership.
-- Stop with a clear error if old data would exceed capacity, rather than silently
-- overbooking a project or leaving an accepted student without membership.
do $$
declare
  project public.research_opportunities%rowtype;
  invitation public.project_invitations%rowtype;
  membership public.applications%rowtype;
  existing_membership boolean;
  reserved_places integer;
begin
  for project in select p.* from public.research_opportunities p
    where exists (select 1 from public.project_invitations i
      where i.opportunity_id = p.id and i.status = 'Accepted')
    order by p.id for update
  loop
    for invitation in select i.* from public.project_invitations i
      where i.opportunity_id = project.id and i.status = 'Accepted'
        and i.faculty_id = project.owner_id
      order by i.id for update
    loop
      select * into membership from public.applications a
      where a.opportunity_id = project.id
        and a.student_id::text = invitation.student_id::text for update;
      existing_membership := found;
      if not existing_membership or coalesce(membership.status, 'Submitted') = 'Rejected' then
        select count(*)::integer into reserved_places from public.applications a
        where a.opportunity_id = project.id
          and coalesce(a.status, 'Submitted') <> 'Rejected';
        if reserved_places >= project.student_capacity then
          raise exception 'Project "%" has accepted invitations exceeding its capacity. Increase its capacity before running this migration.', project.title;
        end if;
      end if;
      if existing_membership then
        update public.applications set status = 'Accepted', updated_at = now()
        where id = membership.id and status is distinct from 'Accepted';
      else
        membership.student_id := invitation.student_id;
        membership.opportunity_id := project.id;
        insert into public.applications (student_id, opportunity_id, status)
        values (membership.student_id, membership.opportunity_id, 'Accepted');
      end if;
      insert into public.project_message_group_members (group_id, profile_id, invited_by)
      select g.id, invitation.student_id, project.owner_id
      from public.project_message_groups g where g.opportunity_id = project.id
      on conflict do nothing;
    end loop;
  end loop;
end;
$$;

-- Transactional messages feed the existing unread-message bells for both roles.
create or replace function public.notify_project_invitation()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  project_title text;
begin
  select title into project_title from public.research_opportunities
  where id = new.opportunity_id;
  if not found then return new; end if;

  if new.status = 'Pending' then
    insert into public.direct_messages (sender_id, recipient_id, body, project_invitation_id)
    values (new.faculty_id, new.student_id,
      format('You have been invited to "%s". Open Projects → Project invitations to accept or decline.', project_title), new.id);
  elsif tg_op = 'UPDATE' then
    if new.status = 'Accepted' and old.status is distinct from 'Accepted' then
      insert into public.direct_messages (sender_id, recipient_id, body, project_invitation_id)
      values (new.student_id, new.faculty_id,
        format('I accepted your invitation to "%s" and have joined the project.', project_title), new.id);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists project_invitation_notifications on public.project_invitations;
create trigger project_invitation_notifications
after insert or update on public.project_invitations
for each row execute function public.notify_project_invitation();

-- Preserve accepted invitations when faculty send another batch.
create or replace function public.invite_ranked_students(p_opportunity_id text, p_student_ids uuid[])
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if public.current_profile_role() is distinct from 'faculty' or not exists (
    select 1 from public.research_opportunities
    where id = p_opportunity_id and owner_id = auth.uid()
  ) then
    raise exception 'Only the project owner can send invitations.' using errcode = '42501';
  end if;
  insert into public.project_invitations (
    opportunity_id, student_id, faculty_id, status, student_response, updated_at
  )
  select p_opportunity_id, p.id, auth.uid(), 'Pending', null, now()
  from public.profiles p
  where p.id = any(p_student_ids) and p.role = 'student'
    and coalesce(p.account_status, 'active') = 'active'
  on conflict (opportunity_id, student_id) do update
    set faculty_id = excluded.faculty_id, status = 'Pending',
        student_response = null, updated_at = now()
    where project_invitations.status <> 'Accepted';
end;
$$;

revoke all on function public.invite_ranked_students(text, uuid[]) from public, anon;
grant execute on function public.invite_ranked_students(text, uuid[]) to authenticated;

create or replace function public.mark_project_invitation_notification_read(p_message_id uuid)
returns void
language sql security definer set search_path = public
as $$
  update public.direct_messages set read_at = coalesce(read_at, now())
  where id = p_message_id and recipient_id = auth.uid()
    and project_invitation_id is not null;
$$;
revoke all on function public.mark_project_invitation_notification_read(uuid) from public, anon;
grant execute on function public.mark_project_invitation_notification_read(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;

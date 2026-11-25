alter table public.direct_messages
  add column if not exists research_idea_id bigint
    references public.research_ideas(id) on delete set null;

create index if not exists direct_messages_sender_idea_idx
  on public.direct_messages (sender_id, research_idea_id)
  where research_idea_id is not null;

create index if not exists direct_messages_recipient_idea_idx
  on public.direct_messages (recipient_id, research_idea_id)
  where research_idea_id is not null;

create or replace function public.validate_direct_message_research_idea_invite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  idea_student_id uuid;
begin
  if new.research_idea_id is null then
    return new;
  end if;

  select student_id
  into idea_student_id
  from public.research_ideas
  where id = new.research_idea_id;

  if idea_student_id is distinct from new.sender_id then
    raise exception 'Only the student who owns an idea can invite faculty to it.'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = new.recipient_id
      and role = 'faculty'
  ) then
    raise exception 'Research idea invitations can only be sent to faculty.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_direct_message_research_idea_invite() from public;

drop trigger if exists validate_direct_message_research_idea_invite_trigger
  on public.direct_messages;
create trigger validate_direct_message_research_idea_invite_trigger
before insert or update on public.direct_messages
for each row
execute function public.validate_direct_message_research_idea_invite();

notify pgrst, 'reload schema';

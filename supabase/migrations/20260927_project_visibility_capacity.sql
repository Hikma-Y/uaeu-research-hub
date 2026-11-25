-- Project visibility, capacity, and funded-student support.
--
-- The active UAEU Research Hub frontend uses public.research_opportunities
-- and public.applications.  An application reserves a place immediately,
-- regardless of any later faculty-review status.  Places are therefore
-- derived from the number of application rows rather than stored in a value
-- that a browser could change.

create extension if not exists pgcrypto;

-- First-run safety snapshot.  It records the pre-migration policies, grants,
-- RLS state and same-named database objects so the separate rollback script
-- can restore this project's previous configuration.  It is intentionally
-- inaccessible to API users.
create table if not exists public._project_workflow_rollback_backup (
  migration_key text primary key,
  captured_at timestamptz not null default now(),
  table_state jsonb not null,
  column_state jsonb not null,
  policies jsonb not null,
  relation_grants jsonb not null,
  functions jsonb not null,
  triggers jsonb not null,
  view_state jsonb not null,
  constraint_state jsonb not null,
  index_state jsonb not null
);

alter table public._project_workflow_rollback_backup enable row level security;
revoke all on public._project_workflow_rollback_backup from anon, authenticated;

insert into public._project_workflow_rollback_backup (
  migration_key,
  table_state,
  column_state,
  policies,
  relation_grants,
  functions,
  triggers,
  view_state,
  constraint_state,
  index_state
)
select
  '20260927_project_visibility_capacity_v1',
  jsonb_build_object(
    'research_opportunities', coalesce(
      (
        select jsonb_build_object(
          'exists', true,
          'rls_enabled', relation.relrowsecurity,
          'rls_forced', relation.relforcerowsecurity
        )
        from pg_class relation
        where relation.oid = to_regclass('public.research_opportunities')
      ),
      jsonb_build_object('exists', false)
    ),
    'applications', coalesce(
      (
        select jsonb_build_object(
          'exists', true,
          'rls_enabled', relation.relrowsecurity,
          'rls_forced', relation.relforcerowsecurity
        )
        from pg_class relation
        where relation.oid = to_regclass('public.applications')
      ),
      jsonb_build_object('exists', false)
    )
  ),
  jsonb_build_object(
    'research_opportunities', coalesce(
      (
        select jsonb_object_agg(column_name, true)
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'research_opportunities'
          and column_name in (
            'owner_id',
            'visibility',
            'student_capacity',
            'student_payment_aed',
            'created_at',
            'updated_at'
          )
      ),
      '{}'::jsonb
    ),
    'applications', coalesce(
      (
        select jsonb_object_agg(column_name, true)
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'applications'
          and column_name in ('created_at', 'updated_at')
      ),
      '{}'::jsonb
    )
  ),
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'tablename', policy.tablename,
          'policyname', policy.policyname,
          'permissive', policy.permissive,
          'roles', to_jsonb(policy.roles),
          'command', policy.cmd,
          'using_expression', policy.qual,
          'check_expression', policy.with_check
        )
        order by policy.tablename, policy.policyname
      )
      from pg_policies policy
      where policy.schemaname = 'public'
        and policy.tablename in ('research_opportunities', 'applications')
    ),
    '[]'::jsonb
  ),
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'relation_name', grant_info.table_name,
          'grantee', grant_info.grantee,
          'privilege_type', grant_info.privilege_type
        )
        order by grant_info.table_name, grant_info.grantee, grant_info.privilege_type
      )
      from information_schema.role_table_grants grant_info
      where grant_info.table_schema = 'public'
        and grant_info.table_name in (
          'research_opportunities',
          'applications',
          'public_research_opportunities'
        )
        and grant_info.grantee in ('anon', 'authenticated')
    ),
    '[]'::jsonb
  ),
  jsonb_build_object(
    'protect_reserved_project_places()', (
      select pg_get_functiondef(proc.oid)
      from pg_proc proc
      where proc.oid = to_regprocedure('public.protect_reserved_project_places()')
    ),
    'current_profile_role()', (
      select pg_get_functiondef(proc.oid)
      from pg_proc proc
      where proc.oid = to_regprocedure('public.current_profile_role()')
    ),
    'prevent_profile_role_escalation()', (
      select pg_get_functiondef(proc.oid)
      from pg_proc proc
      where proc.oid = to_regprocedure('public.prevent_profile_role_escalation()')
    ),
    'apply_to_research_opportunity(uuid)', (
      select pg_get_functiondef(proc.oid)
      from pg_proc proc
      where proc.oid = to_regprocedure('public.apply_to_research_opportunity(uuid)')
    )
  ),
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'relation_name', relation.relname,
          'trigger_name', trigger.tgname,
          'definition', pg_get_triggerdef(trigger.oid, true)
        )
        order by relation.relname, trigger.tgname
      )
      from pg_trigger trigger
      join pg_class relation on relation.oid = trigger.tgrelid
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and trigger.tgisinternal = false
        and (
          (relation.relname = 'research_opportunities'
            and trigger.tgname = 'research_opportunities_protect_reserved_places')
          or (relation.relname = 'profiles'
            and trigger.tgname = 'profiles_prevent_role_escalation')
        )
    ),
    '[]'::jsonb
  ),
  coalesce(
    (
      select jsonb_build_object(
        'exists', true,
        'definition', pg_get_viewdef(relation.oid, true),
        'options', coalesce(to_jsonb(relation.reloptions), '[]'::jsonb)
      )
      from pg_class relation
      where relation.oid = to_regclass('public.public_research_opportunities')
        and relation.relkind = 'v'
    ),
    jsonb_build_object('exists', false)
  ),
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'constraint_name', constraint_info.conname,
          'definition', pg_get_constraintdef(constraint_info.oid, true)
        )
        order by constraint_info.conname
      )
      from pg_constraint constraint_info
      where constraint_info.conrelid = to_regclass('public.research_opportunities')
        and constraint_info.conname in (
          'research_opportunities_visibility_check',
          'research_opportunities_student_capacity_check',
          'research_opportunities_student_payment_aed_check',
          'research_opportunities_owner_required'
        )
    ),
    '[]'::jsonb
  ),
  coalesce(
    (
      select jsonb_object_agg(index_info.indexname, index_info.indexdef)
      from pg_indexes index_info
      where index_info.schemaname = 'public'
        and index_info.indexname in (
          'idx_research_opportunities_public_listing',
          'idx_research_opportunities_owner',
          'idx_applications_opportunity',
          'applications_one_per_student_opportunity'
        )
    ),
    '{}'::jsonb
  )
on conflict (migration_key) do nothing;

create table if not exists public.research_opportunities (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  type text not null,
  department text not null,
  description text,
  tags text[] not null default '{}',
  requirements text[] not null default '{}',
  supervisor text,
  deadline date,
  commitment text,
  owner_id uuid references public.profiles(id) on delete restrict,
  visibility text not null default 'public',
  student_capacity integer not null default 1,
  student_payment_aed numeric(12, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  opportunity_id uuid not null references public.research_opportunities(id) on delete cascade,
  status text not null default 'Submitted',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.applications
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.research_opportunities
  add column if not exists owner_id uuid references public.profiles(id) on delete restrict,
  add column if not exists visibility text not null default 'public',
  add column if not exists student_capacity integer not null default 1,
  add column if not exists student_payment_aed numeric(12, 2),
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

-- Keep existing opportunity records visible after the migration.  When an
-- older schema already tracked a creator, preserve that ownership as well.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'research_opportunities'
      and column_name = 'faculty_id'
  ) then
    execute 'update public.research_opportunities set owner_id = faculty_id where owner_id is null';
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'research_opportunities'
      and column_name = 'created_by'
  ) then
    execute 'update public.research_opportunities set owner_id = created_by where owner_id is null';
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'research_opportunities'
      and column_name = 'user_id'
  ) then
    execute 'update public.research_opportunities set owner_id = user_id where owner_id is null';
  end if;
end $$;

update public.research_opportunities
set visibility = 'public'
where visibility is null or visibility not in ('draft', 'public');

update public.research_opportunities
set student_capacity = 1
where student_capacity is null or student_capacity < 1;

alter table public.research_opportunities
  drop constraint if exists research_opportunities_visibility_check,
  add constraint research_opportunities_visibility_check
    check (visibility in ('draft', 'public')),
  drop constraint if exists research_opportunities_student_capacity_check,
  add constraint research_opportunities_student_capacity_check
    check (student_capacity >= 1),
  drop constraint if exists research_opportunities_student_payment_aed_check,
  add constraint research_opportunities_student_payment_aed_check
    check (student_payment_aed is null or student_payment_aed >= 0),
  drop constraint if exists research_opportunities_owner_required;

-- NOT VALID keeps legacy public rows that had no creator while requiring an
-- owner for every new or edited row.  The migration never discards data.
alter table public.research_opportunities
  add constraint research_opportunities_owner_required
    check (owner_id is not null) not valid;

create index if not exists idx_research_opportunities_public_listing
  on public.research_opportunities (visibility, created_at desc);

create index if not exists idx_research_opportunities_owner
  on public.research_opportunities (owner_id, created_at desc);

create index if not exists idx_applications_opportunity
  on public.applications (opportunity_id);

create unique index if not exists applications_one_per_student_opportunity
  on public.applications (student_id, opportunity_id);

comment on column public.research_opportunities.visibility is
  'draft is private to the owner; public is visible to students and can receive applications.';

comment on column public.research_opportunities.student_capacity is
  'Number of student places required. Remaining places are calculated from applications.';

comment on column public.research_opportunities.student_payment_aed is
  'Optional student stipend in AED. NULL means the project is unpaid or funding is not stated.';

comment on table public.applications is
  'Every application reserves a project place immediately, including applications under faculty review.';

-- A faculty member may edit a posting, but cannot lower its capacity below
-- places already reserved or turn a live project with applicants back into a
-- private draft.
create or replace function public.protect_reserved_project_places()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  reserved_places integer;
begin
  if new.student_capacity < old.student_capacity
    or (new.visibility = 'draft' and old.visibility = 'public') then
    select count(*)::integer
    into reserved_places
    from public.applications application
    where application.opportunity_id = old.id;

    if new.student_capacity < reserved_places then
      raise exception 'Student capacity cannot be lower than the number of reserved places.' using errcode = '23514';
    end if;

    if new.visibility = 'draft' and old.visibility = 'public' and reserved_places > 0 then
      raise exception 'A project with applications cannot be changed back to a private draft.' using errcode = '23514';
    end if;
  end if;

  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists research_opportunities_protect_reserved_places on public.research_opportunities;
create trigger research_opportunities_protect_reserved_places
before update on public.research_opportunities
for each row execute function public.protect_reserved_project_places();

-- SECURITY DEFINER avoids recursive RLS lookups when a policy needs the
-- signed-in user role.  The function returns only the caller's own role.
create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid()
  limit 1;
$$;

-- Project policies use profiles.role, so a signed-in user must not be able to
-- elevate their own role through a broad profile update policy.
create or replace function public.prevent_profile_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role
    and auth.uid() is not null
    and public.current_profile_role() is distinct from 'admin' then
    raise exception 'Only an administrator can change a profile role.' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_prevent_role_escalation on public.profiles;
create trigger profiles_prevent_role_escalation
before update on public.profiles
for each row execute function public.prevent_profile_role_escalation();

-- Public list used by the student dashboard.  The explicit visibility filter
-- is deliberately inside the view, and remaining_slots is derived from all
-- reserved applications.  No client can write this value.
create or replace view public.public_research_opportunities
with (security_barrier = true)
as
  select
    opportunity.*,
    greatest(
      opportunity.student_capacity - count(application.id)::integer,
      0
    ) as remaining_slots
  from public.research_opportunities opportunity
  left join public.applications application
    on application.opportunity_id = opportunity.id
  where opportunity.visibility = 'public'
  group by opportunity.id;

alter table public.research_opportunities enable row level security;
alter table public.applications enable row level security;

-- Replace only the policies on the two workflow tables so an older permissive
-- policy cannot accidentally expose a draft or permit browser-side inserts.
do $$
declare
  existing_policy record;
begin
  for existing_policy in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in ('research_opportunities', 'applications')
  loop
    execute format(
      'drop policy if exists %I on public.%I',
      existing_policy.policyname,
      existing_policy.tablename
    );
  end loop;
end $$;

create policy "students read public opportunities"
on public.research_opportunities
for select
to authenticated
using (
  visibility = 'public'
  and public.current_profile_role() = 'student'
);

create policy "faculty read own opportunities"
on public.research_opportunities
for select
to authenticated
using (
  owner_id = auth.uid()
  and public.current_profile_role() = 'faculty'
);

create policy "admins manage opportunities"
on public.research_opportunities
for all
to authenticated
using (public.current_profile_role() = 'admin')
with check (public.current_profile_role() = 'admin');

create policy "faculty create own opportunities"
on public.research_opportunities
for insert
to authenticated
with check (
  owner_id = auth.uid()
  and public.current_profile_role() = 'faculty'
);

create policy "faculty update own opportunities"
on public.research_opportunities
for update
to authenticated
using (
  owner_id = auth.uid()
  and public.current_profile_role() = 'faculty'
)
with check (
  owner_id = auth.uid()
  and public.current_profile_role() = 'faculty'
);

create policy "faculty delete own opportunities"
on public.research_opportunities
for delete
to authenticated
using (
  owner_id = auth.uid()
  and public.current_profile_role() = 'faculty'
);

create policy "students read own applications"
on public.applications
for select
to authenticated
using (
  student_id = auth.uid()
  and public.current_profile_role() = 'student'
);

create policy "faculty read applications for own opportunities"
on public.applications
for select
to authenticated
using (
  public.current_profile_role() = 'faculty'
  and exists (
    select 1
    from public.research_opportunities opportunity
    where opportunity.id = applications.opportunity_id
      and opportunity.owner_id = auth.uid()
  )
);

create policy "admins manage applications"
on public.applications
for all
to authenticated
using (public.current_profile_role() = 'admin')
with check (public.current_profile_role() = 'admin');

-- The sole student-application entry point.  The row lock serializes requests
-- for one project, so two near-simultaneous applicants cannot overbook it.
create or replace function public.apply_to_research_opportunity(
  p_opportunity_id uuid
)
returns public.applications
language plpgsql
security definer
set search_path = public
as $$
declare
  current_student_id uuid := auth.uid();
  locked_opportunity public.research_opportunities%rowtype;
  reserved_places integer;
  inserted_application public.applications%rowtype;
begin
  if current_student_id is null then
    raise exception 'You must be signed in to apply.' using errcode = '42501';
  end if;

  if public.current_profile_role() is distinct from 'student' then
    raise exception 'Only student accounts can apply to research projects.' using errcode = '42501';
  end if;

  select *
  into locked_opportunity
  from public.research_opportunities
  where id = p_opportunity_id
  for update;

  if not found or locked_opportunity.visibility <> 'public' then
    raise exception 'This project is not available for applications.' using errcode = 'P0001';
  end if;

  if locked_opportunity.deadline is not null
    and locked_opportunity.deadline < current_date then
    raise exception 'The application deadline for this project has passed.' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.applications application
    where application.opportunity_id = p_opportunity_id
      and application.student_id = current_student_id
  ) then
    raise exception 'You have already applied to this project.' using errcode = '23505';
  end if;

  select count(*)::integer
  into reserved_places
  from public.applications application
  where application.opportunity_id = p_opportunity_id;

  if reserved_places >= locked_opportunity.student_capacity then
    raise exception 'This project is full.' using errcode = 'P0001';
  end if;

  insert into public.applications (
    student_id,
    opportunity_id,
    status
  )
  values (
    current_student_id,
    p_opportunity_id,
    'Submitted'
  )
  returning * into inserted_application;

  return inserted_application;
end;
$$;

revoke all on public.research_opportunities from anon;
revoke all on public.applications from anon;
revoke all on public.public_research_opportunities from anon;
revoke insert, update, delete on public.applications from authenticated;

grant select, insert, update, delete on public.research_opportunities to authenticated;
grant select on public.applications to authenticated;
grant select on public.public_research_opportunities to authenticated;
grant execute on function public.current_profile_role() to authenticated;
grant execute on function public.apply_to_research_opportunity(uuid) to authenticated;

notify pgrst, 'reload schema';

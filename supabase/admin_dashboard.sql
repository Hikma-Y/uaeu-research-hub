-- UAEU Research Hub - Admin dashboard migration
-- Run this once in Supabase -> SQL Editor.

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- 1) Extend the tables the application already uses.
-- -----------------------------------------------------------------------------

alter table public.profiles
  add column if not exists account_status text not null default 'active';

alter table public.research_opportunities
  add column if not exists status text not null default 'Open',
  add column if not exists updated_at timestamptz not null default now();

-- Keep account status values predictable.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_account_status_check'
  ) then
    alter table public.profiles
      add constraint profiles_account_status_check
      check (account_status in ('active', 'pending', 'suspended'));
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 2) New admin-facing tables.
-- opportunity_id is text intentionally: this works whether the existing
-- research_opportunities.id is numeric, UUID, or a custom project code.
-- -----------------------------------------------------------------------------

create table if not exists public.project_milestones (
  id uuid primary key default gen_random_uuid(),
  opportunity_id text not null,
  title text not null,
  description text,
  due_date date,
  status text not null default 'Pending'
    check (status in ('Pending', 'In Progress', 'Completed')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  audience text not null default 'everyone'
    check (audience in ('everyone', 'students', 'faculty')),
  priority text not null default 'normal'
    check (priority in ('normal', 'important', 'urgent')),
  published_at timestamptz not null default now(),
  expires_at date,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_activity_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id text,
  description text not null,
  created_at timestamptz not null default now()
);

create index if not exists project_milestones_opportunity_idx
  on public.project_milestones(opportunity_id);

create index if not exists announcements_published_idx
  on public.announcements(published_at desc);

create index if not exists admin_activity_log_created_idx
  on public.admin_activity_log(created_at desc);

-- -----------------------------------------------------------------------------
-- 3) Admin helper used by RLS and security checks.
-- -----------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and coalesce(account_status, 'active') = 'active'
  );
$$;

grant execute on function public.is_admin() to authenticated;

-- Prevent ordinary users from promoting themselves to admin or changing
-- account_status. Admins may change these values through the Admin dashboard.
create or replace function public.protect_profile_admin_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.role is distinct from old.role then
      raise exception 'Only administrators may change account roles';
    end if;

    if new.account_status is distinct from old.account_status then
      raise exception 'Only administrators may change account status';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists protect_profile_admin_fields_trigger on public.profiles;
create trigger protect_profile_admin_fields_trigger
before update on public.profiles
for each row
execute function public.protect_profile_admin_fields();

-- -----------------------------------------------------------------------------
-- 4) Row Level Security.
-- These policies ADD admin access. They do not remove your existing student or
-- faculty policies.
-- -----------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.research_opportunities enable row level security;
alter table public.applications enable row level security;
alter table public.research_ideas enable row level security;
alter table public.project_milestones enable row level security;
alter table public.announcements enable row level security;
alter table public.admin_activity_log enable row level security;

-- Existing tables: give admins complete access in addition to existing policies.
drop policy if exists "Admins manage profiles" on public.profiles;
create policy "Admins manage profiles"
on public.profiles
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins manage research opportunities" on public.research_opportunities;
create policy "Admins manage research opportunities"
on public.research_opportunities
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins manage applications" on public.applications;
create policy "Admins manage applications"
on public.applications
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins manage research ideas" on public.research_ideas;
create policy "Admins manage research ideas"
on public.research_ideas
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Milestones: authenticated users may read, admins manage.
drop policy if exists "Authenticated users read milestones" on public.project_milestones;
create policy "Authenticated users read milestones"
on public.project_milestones
for select
to authenticated
using (true);

drop policy if exists "Admins manage milestones" on public.project_milestones;
create policy "Admins manage milestones"
on public.project_milestones
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Announcements: authenticated users may read active announcements; admins manage.
drop policy if exists "Authenticated users read announcements" on public.announcements;
create policy "Authenticated users read announcements"
on public.announcements
for select
to authenticated
using (
  is_active = true
  and (expires_at is null or expires_at >= current_date)
  or public.is_admin()
);

drop policy if exists "Admins manage announcements" on public.announcements;
create policy "Admins manage announcements"
on public.announcements
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Audit log is admin-only.
drop policy if exists "Admins read activity log" on public.admin_activity_log;
create policy "Admins read activity log"
on public.admin_activity_log
for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins create activity log" on public.admin_activity_log;
create policy "Admins create activity log"
on public.admin_activity_log
for insert
to authenticated
with check (public.is_admin() and admin_id = auth.uid());

-- Helpful grants. RLS still controls which rows are accessible.
grant select, insert, update, delete on public.project_milestones to authenticated;
grant select, insert, update, delete on public.announcements to authenticated;
grant select, insert on public.admin_activity_log to authenticated;

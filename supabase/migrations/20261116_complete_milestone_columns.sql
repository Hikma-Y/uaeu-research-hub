-- Existing deployments may predate the columns used by the milestone forms.
-- CREATE TABLE IF NOT EXISTS in admin_dashboard.sql does not upgrade those tables.
begin;

alter table public.project_milestones
  add column if not exists description text,
  add column if not exists completed_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

notify pgrst, 'reload schema';
commit;

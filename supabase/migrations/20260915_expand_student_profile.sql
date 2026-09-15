
alter table public.profiles
  add column if not exists headline text,
  add column if not exists bio text,
  add column if not exists gpa numeric(3, 2)
    check (gpa is null or (gpa >= 0 and gpa <= 4)),
  add column if not exists expected_graduation_year integer
    check (
      expected_graduation_year is null
      or expected_graduation_year between 2026 and 2100
    ),
  add column if not exists relevant_coursework text[] not null default '{}',
  add column if not exists research_tools text[] not null default '{}',
  add column if not exists languages text[] not null default '{}',
  add column if not exists achievements text[] not null default '{}',
  add column if not exists linkedin_url text,
  add column if not exists github_url text,
  add column if not exists portfolio_url text,
  add column if not exists student_projects jsonb not null default '[]'::jsonb,
  add column if not exists has_research_experience boolean not null default false,
  add column if not exists experience_entries jsonb not null default '[]'::jsonb;

comment on column public.profiles.student_projects is
  'Student portfolio entries: title, role, description, and optional link.';

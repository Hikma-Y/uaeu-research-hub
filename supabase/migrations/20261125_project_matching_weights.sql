-- Requires the existing private-invitation student view and complete-matching
-- minimum_gpa column. No eligibility, invitation, or RLS rules are changed.
begin;

-- Fail closed rather than inventing a replacement for a deployment's live view.
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_class
    where oid = pg_catalog.to_regclass('public.student_research_opportunities')
      and relkind = 'v'
  ) then
    raise exception 'Project matching weights requires public.student_research_opportunities to be an existing ordinary view.'
      using hint = 'Install the private-project invitation membership migration before this migration; do not substitute an unfiltered project view.';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_attribute
    where attrelid = pg_catalog.to_regclass('public.research_opportunities')
      and attname = 'minimum_gpa' and attnum > 0 and not attisdropped
  ) then
    raise exception 'Project matching weights requires public.research_opportunities.minimum_gpa.'
      using hint = 'Install the complete-matching migration before this migration.';
  end if;
end;
$$;

create or replace function public.is_valid_project_matching_weights(weights jsonb)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  entry record;
  total integer := 0;
  key_count integer := 0;
begin
  if weights is null or jsonb_typeof(weights) <> 'object' then
    return false;
  end if;

  for entry in select key, value from jsonb_each(weights) loop
    if entry.key not in ('semantic', 'skills', 'academic', 'gpa', 'experience')
      or jsonb_typeof(entry.value) <> 'number' then
      return false;
    end if;
    -- Validate before casting: reject fractions, decimal spellings, negatives,
    -- and arbitrarily large JSON numbers without risking integer overflow.
    if entry.value::text !~ '^(0|[1-9][0-9]?|100)$' then
      return false;
    end if;
    total := total + entry.value::text::integer;
    key_count := key_count + 1;
  end loop;

  return key_count = 5 and total = 100;
end;
$$;

alter table public.research_opportunities
  add column if not exists matching_weights jsonb not null
    default '{"semantic":40,"skills":25,"academic":10,"gpa":10,"experience":15}'::jsonb;

alter table public.research_opportunities
  alter column matching_weights set default '{"semantic":40,"skills":25,"academic":10,"gpa":10,"experience":15}'::jsonb,
  alter column matching_weights set not null;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.research_opportunities'::regclass
      and conname = 'research_opportunities_matching_weights_check'
  ) then
    alter table public.research_opportunities
      add constraint research_opportunities_matching_weights_check
      check (public.is_valid_project_matching_weights(matching_weights));
  end if;
end;
$$;

-- CREATE OR REPLACE keeps the view OID, owner, grants, and column metadata.
-- Explicitly carry forward all view options: omitting WITH resets them,
-- including security_barrier/security_invoker. Keep every
-- installed expression/filter and append only absent columns, so dependent
-- views survive and text/UUID IDs use their native equality operator.
do $$
declare
  view_oid oid := 'public.student_research_opportunities'::regclass;
  existing_definition text;
  existing_options text;
  appended_columns text := '';
  column_name text;
begin
  foreach column_name in array array['matching_weights', 'minimum_gpa'] loop
    if not exists (
      select 1 from pg_catalog.pg_attribute
      where attrelid = view_oid and attname = column_name
        and attnum > 0 and not attisdropped
    ) then
      appended_columns := appended_columns || format(', project.%I', column_name);
    end if;
  end loop;

  if appended_columns <> '' then
    if not exists (
      select 1 from pg_catalog.pg_attribute
      where attrelid = view_oid and attname = 'id'
        and attnum > 0 and not attisdropped
    ) then
      raise exception 'Cannot append matching columns: public.student_research_opportunities must expose the project id.'
        using hint = 'Restore the existing student project view with its native project id column before retrying.';
    end if;
    existing_definition := regexp_replace(pg_catalog.pg_get_viewdef(view_oid, false), ';[[:space:]]*$', '');
    select string_agg(format('%I = %L', option_name, option_value), ', ')
      into existing_options
    from pg_catalog.pg_class c,
      lateral pg_catalog.pg_options_to_table(c.reloptions)
    where c.oid = view_oid;
    execute format(
      'create or replace view public.student_research_opportunities %s as
       select existing_project.*%s
       from (%s) as existing_project
       join public.research_opportunities as project on project.id = existing_project.id',
      case when existing_options is null then '' else 'with (' || existing_options || ')' end,
      appended_columns, existing_definition
    );
  end if;
end;
$$;

commit;

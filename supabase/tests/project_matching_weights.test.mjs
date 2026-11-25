// Run with node --test after installing @electric-sql/pglite in a temporary
// directory; set PGLITE_MODULE_PATH to that package's dist/index.js.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

const { PGlite } = await import(process.env.PGLITE_MODULE_PATH
  ? pathToFileURL(process.env.PGLITE_MODULE_PATH).href : '@electric-sql/pglite')
const migration = await readFile(new URL('../migrations/20261125_project_matching_weights.sql', import.meta.url), 'utf8')
const defaults = { semantic: 40, skills: 25, academic: 10, gpa: 10, experience: 15 }
const custom = { semantic: 100, skills: 0, academic: 0, gpa: 0, experience: 0 }
const owner = '00000000-0000-0000-0000-000000000001'
const otherFaculty = '00000000-0000-0000-0000-000000000002'
const student = '00000000-0000-0000-0000-000000000003'
const outsider = '00000000-0000-0000-0000-000000000004'
const projectIds = [11, 12, 13, 14].map(id => `10000000-0000-0000-0000-${String(id).padStart(12, '0')}`)

async function scalar(db, sql, params = []) {
  return Object.values((await db.query(sql, params)).rows[0])[0]
}

async function signIn(db, id, role) {
  await db.exec(`reset role; set request.jwt.claim.sub = '${id}'; set request.jwt.claim.profile_role = '${role}'; set role authenticated;`)
}

async function fixture({ idType = 'text', existingColumns = [], invoker = false } = {}) {
  const db = new PGlite()
  await db.exec(`
    create role authenticated;
    create role anon;
    create role student_view_owner;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function public.current_profile_role() returns text language sql stable as
      $$ select current_setting('request.jwt.claim.profile_role', true) $$;
    create table public.research_opportunities (
      id ${idType} primary key, title text, owner_id uuid, visibility text,
      student_capacity integer, minimum_gpa numeric(3, 2)
      ${existingColumns.includes('matching_weights') ? `, matching_weights jsonb not null default '${JSON.stringify(defaults)}'::jsonb` : ''}
    );
    create table public.project_invitations (
      opportunity_id ${idType}, student_id uuid, status text
    );
    create table public.applications (
      opportunity_id ${idType}, status text
    );
    alter table public.research_opportunities enable row level security;
    create policy read_projects on public.research_opportunities for select to authenticated
      using (visibility = 'public' or owner_id = auth.uid() or exists (
        select 1 from public.project_invitations i
        where i.opportunity_id = research_opportunities.id
          and i.student_id = auth.uid() and i.status = 'Accepted'
      ));
    create policy insert_own_projects on public.research_opportunities for insert to authenticated
      with check (public.current_profile_role() = 'faculty' and owner_id = auth.uid());
    create policy update_own_projects on public.research_opportunities for update to authenticated
      using (public.current_profile_role() = 'faculty' and owner_id = auth.uid())
      with check (public.current_profile_role() = 'faculty' and owner_id = auth.uid());
    grant usage on schema public, auth to authenticated, student_view_owner;
    grant select, insert, update on public.research_opportunities to authenticated;
    grant select on public.project_invitations, public.applications to authenticated;
    grant select on public.research_opportunities, public.project_invitations, public.applications to student_view_owner;
    create policy view_owner_projects on public.research_opportunities for select to student_view_owner using (true);
    insert into public.research_opportunities (id, title, owner_id, visibility, student_capacity, minimum_gpa) values
      ('${projectIds[0]}', 'Public', '${owner}', 'public', 3, 2.75),
      ('${projectIds[1]}', 'Accepted private', '${owner}', 'draft', 2, null),
      ('${projectIds[2]}', 'Pending private', '${owner}', 'draft', 1, 3.00),
      ('${projectIds[3]}', 'Other faculty', '${otherFaculty}', 'public', 1, null);
    insert into public.project_invitations values
      ('${projectIds[1]}', '${student}', 'Accepted'), ('${projectIds[2]}', '${student}', 'Pending');
    insert into public.applications values ('${projectIds[0]}', 'Submitted'), ('${projectIds[0]}', 'Rejected');
    -- Explicit legacy column list deliberately differs from project.* and
    -- includes a computed field that a reconstructed view could easily lose.
    create view public.student_research_opportunities
    with (security_barrier = true, security_invoker = ${invoker}) as
      select p.id, upper(p.title) as display_title,
        greatest(p.student_capacity - count(a.opportunity_id) filter (
          where coalesce(a.status, 'Submitted') <> 'Rejected'
        )::integer, 0) as remaining_slots
        ${existingColumns.map(name => `, p.${name}`).join('')}
      from public.research_opportunities p
      left join public.applications a on a.opportunity_id = p.id
      where public.current_profile_role() = 'student'
        and (p.visibility = 'public' or exists (
          select 1 from public.project_invitations i where i.opportunity_id = p.id
            and i.student_id = auth.uid() and i.status = 'Accepted'
        ))
      group by p.id;
    alter view public.student_research_opportunities owner to student_view_owner;
    revoke all on public.student_research_opportunities from public, anon;
    grant select on public.student_research_opportunities to authenticated;
    grant select (display_title) on public.student_research_opportunities to anon;
    comment on view public.student_research_opportunities is 'Keep installed view metadata';
    comment on column public.student_research_opportunities.display_title is 'Keep column metadata';
    create view public.dependent_student_projects as
      select id, display_title, remaining_slots from public.student_research_opportunities;
    grant select on public.dependent_student_projects to authenticated;
  `)
  return db
}

async function metadata(db) {
  return (await db.query(`
    select c.oid, c.relowner, c.relacl::text, c.reloptions,
      obj_description(c.oid) as comment,
      (select jsonb_agg(jsonb_build_array(a.attname, a.atttypid, a.atttypmod, a.attacl::text,
        col_description(c.oid, a.attnum)) order by a.attnum)
       from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped) as columns
    from pg_class c where c.oid = 'public.student_research_opportunities'::regclass
  `)).rows[0]
}

for (const idType of ['text', 'uuid']) {
  test(`strict matching weights validation and defaults (${idType} project IDs)`, async () => {
    const db = await fixture({ idType })
    try {
      await db.exec(migration)
      assert.equal(await scalar(db, 'select count(*) from research_opportunities where matching_weights = $1::jsonb', [JSON.stringify(defaults)]), 4)
      await signIn(db, owner, 'faculty')
      await db.exec(`insert into research_opportunities (id, owner_id) values ('10000000-0000-0000-0000-000000000015', '${owner}');`)
      assert.deepEqual(await scalar(db, "select matching_weights from research_opportunities where id = '10000000-0000-0000-0000-000000000015'"), defaults)
      for (const valid of [defaults, custom, { semantic: 0, skills: 0, academic: 0, gpa: 0, experience: 100 }]) {
        await db.query('update research_opportunities set matching_weights = $1::jsonb where id = $2', [JSON.stringify(valid), projectIds[0]])
      }
      const invalid = [
        null, true, false, 'weights', 100, [], {},
        { ...defaults, semantic: null }, { ...defaults, semantic: true },
        { ...defaults, semantic: '40' }, { ...defaults, semantic: -1, skills: 66 },
        { ...defaults, semantic: 39.5, skills: 25.5 },
        { ...defaults, semantic: 101, skills: 0 },
        { ...defaults, extra: 0 }, { semantic: 40, skills: 25, academic: 20, gpa: 15 },
        { ...defaults, semantic: 0 },
        { semantic: 0, skills: 0, academic: 0, gpa: 0, experience: 0 },
      ].map(value => JSON.stringify(value))
      invalid.push('{"semantic":40.0,"skills":25,"academic":10,"gpa":10,"experience":15}',
        '{"semantic":1e1000,"skills":25,"academic":10,"gpa":10,"experience":15}')
      for (const value of invalid) {
        assert.equal(await scalar(db, 'select public.is_valid_project_matching_weights($1::jsonb)', [value]), false, value)
        for (const sql of [
          'update research_opportunities set matching_weights = $1::jsonb where id = $2',
          `insert into research_opportunities (matching_weights, id, owner_id) values ($1::jsonb, $2, '${owner}')`,
        ]) {
          await assert.rejects(db.query(sql, [value, sql.startsWith('update') ? projectIds[0] : '10000000-0000-0000-0000-000000000016']),
            error => error.code === '23514', value)
        }
      }
      assert.equal(await scalar(db, 'select public.is_valid_project_matching_weights(null)'), false)
      await assert.rejects(db.query('update research_opportunities set matching_weights = $1 where id = $2', [null, projectIds[0]]), error => error.code === '23502')
      await assert.rejects(db.exec(`insert into research_opportunities (id, owner_id, matching_weights) values ('10000000-0000-0000-0000-000000000016', '${owner}', null)`), error => error.code === '23502')
    } finally {
      await db.close()
    }
  })

  for (const invoker of [false, true]) {
    test(`append live view columns without changing security, metadata or dependencies (${idType}, invoker=${invoker})`, async () => {
      const db = await fixture({ idType, invoker })
      try {
        const before = await metadata(db)
        const policies = (await db.query('select * from pg_policies order by policyname')).rows
        await signIn(db, student, 'student')
        const originalRows = (await db.query('select * from student_research_opportunities order by id')).rows
        await db.exec('reset role;')
        await db.exec(migration)
        const after = await metadata(db)
        assert.deepEqual({ ...after, columns: after.columns.slice(0, before.columns.length) }, before)
        assert.deepEqual(after.columns.map(column => column[0]), ['id', 'display_title', 'remaining_slots', 'matching_weights', 'minimum_gpa'])
        assert.deepEqual((await db.query('select * from pg_policies order by policyname')).rows, policies)
        await signIn(db, student, 'student')
        const rows = (await db.query('select * from student_research_opportunities order by id')).rows
        assert.deepEqual(rows.map(({ matching_weights, minimum_gpa, ...row }) => row), originalRows)
        assert.deepEqual(rows.map(row => row.id), [projectIds[0], projectIds[1], projectIds[3]])
        assert.deepEqual(rows[0].matching_weights, defaults)
        assert.equal(Number(rows[0].minimum_gpa), 2.75)
        assert.equal(rows[1].minimum_gpa, null)
        assert.equal(rows[0].remaining_slots, 2)
        assert.deepEqual((await db.query('select * from dependent_student_projects order by id')).rows, originalRows)
        await signIn(db, outsider, 'student')
        assert.deepEqual((await db.query('select id from student_research_opportunities order by id')).rows.map(row => row.id), [projectIds[0], projectIds[3]])
        await signIn(db, owner, 'faculty')
        assert.equal(await scalar(db, 'select count(*) from student_research_opportunities'), 0)
        await db.exec('reset role; set role anon;')
        await assert.rejects(db.exec('select * from student_research_opportunities'), /permission denied/)
        await db.exec('reset role;')
        const definition = await scalar(db, "select pg_get_viewdef('student_research_opportunities'::regclass)")
        await db.exec(migration)
        assert.deepEqual(await metadata(db), after)
        assert.equal(await scalar(db, "select pg_get_viewdef('student_research_opportunities'::regclass)"), definition, 'reruns do not nest the wrapper')
      } finally {
        await db.close()
      }
    })
  }
}

test('owner-only project writes remain enforced and custom weights survive reruns', async () => {
  const db = await fixture()
  try {
    await db.exec(migration)
    await signIn(db, owner, 'faculty')
    assert.equal((await db.query('update research_opportunities set matching_weights = $1 where id = $2 returning id', [JSON.stringify(custom), projectIds[0]])).rows.length, 1)
    await assert.rejects(db.exec(`update research_opportunities set owner_id = '${otherFaculty}' where id = '${projectIds[0]}'`), /row-level security/)
    for (const [id, role] of [[otherFaculty, 'faculty'], [student, 'student']]) {
      await signIn(db, id, role)
      assert.equal((await db.query('update research_opportunities set matching_weights = $1 where id = $2 returning id', [JSON.stringify(defaults), projectIds[0]])).rows.length, 0)
      await assert.rejects(db.exec(`insert into research_opportunities (id, owner_id) values ('10000000-0000-0000-0000-000000000020', '${owner}')`), /row-level security/)
    }
    await db.exec('reset role;')
    await db.exec(migration)
    assert.deepEqual(await scalar(db, 'select matching_weights from research_opportunities where id = $1', [projectIds[0]]), custom)
    assert.equal(await scalar(db, "select count(*) from pg_constraint where conrelid = 'research_opportunities'::regclass and conname = 'research_opportunities_matching_weights_check'"), 1)
  } finally {
    await db.close()
  }
})

for (const existingColumns of [['minimum_gpa'], ['matching_weights'], ['minimum_gpa', 'matching_weights']]) {
  test(`only append absent columns: existing ${existingColumns.join(', ')}`, async () => {
    const db = await fixture({ existingColumns })
    try {
      const before = await metadata(db)
      await db.exec(migration)
      const after = await metadata(db)
      const missing = ['matching_weights', 'minimum_gpa'].filter(name => !existingColumns.includes(name))
      assert.deepEqual(after.columns.map(column => column[0]), [...before.columns.map(column => column[0]), ...missing])
      await db.exec(migration)
      assert.deepEqual(await metadata(db), after)
    } finally {
      await db.close()
    }
  })
}

for (const missing of ['view', 'minimum_gpa', 'id']) {
  test(`missing ${missing} prerequisite fails actionably and rolls back`, async () => {
    const db = await fixture()
    try {
      if (missing === 'view') await db.exec('drop view dependent_student_projects; drop view student_research_opportunities;')
      if (missing === 'minimum_gpa') await db.exec('alter table research_opportunities drop column minimum_gpa;')
      if (missing === 'id') await db.exec('alter view student_research_opportunities rename column id to legacy_id;')
      await assert.rejects(db.exec(migration), error => /requires|must expose/.test(error.message) && Boolean(error.hint))
      await db.exec('rollback;')
      assert.equal(await scalar(db, "select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'research_opportunities' and column_name = 'matching_weights'"), 0)
      if (missing === 'view') assert.equal(await scalar(db, "select to_regclass('public.student_research_opportunities')"), null)
    } finally {
      await db.close()
    }
  })
}

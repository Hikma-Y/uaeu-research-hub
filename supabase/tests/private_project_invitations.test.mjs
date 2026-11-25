// Run with node --test after installing @electric-sql/pglite in a temporary
// directory; set PGLITE_MODULE_PATH to that package's dist/index.js.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

const { PGlite } = await import(process.env.PGLITE_MODULE_PATH
  ? pathToFileURL(process.env.PGLITE_MODULE_PATH).href : '@electric-sql/pglite')
const migration = await readFile(new URL('../migrations/20261003_private_project_invitation_membership.sql', import.meta.url), 'utf8')
const removalMigration = await readFile(new URL('../migrations/20261003_faculty_remove_project_student.sql', import.meta.url), 'utf8')
const faculty = '00000000-0000-0000-0000-000000000001'
const students = [2, 3, 4].map(id => `00000000-0000-0000-0000-${String(id).padStart(12, '0')}`)

async function fixture(studentIdType, acceptedBeforeMigration = false) {
  const db = new PGlite()
  await db.exec(`
    create role authenticated;
    create role anon;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table profiles (id uuid primary key, role text, account_status text);
    create function current_profile_role() returns text language sql stable security definer as
      $$ select role from profiles where id = auth.uid() $$;
    create table research_opportunities (
      id text primary key, title text, owner_id uuid, visibility text, student_capacity int
    );
    create table applications (
      id bigint generated always as identity primary key,
      opportunity_id text references research_opportunities,
      student_id ${studentIdType}, status text, updated_at timestamptz default now(),
      unique (opportunity_id, student_id)
    );
    create table project_invitations (
      id uuid primary key default gen_random_uuid(), opportunity_id text,
      faculty_id uuid, student_id uuid, status text default 'Pending',
      student_response text, updated_at timestamptz default now(),
      unique (opportunity_id, student_id)
    );
    create table direct_messages (
      id uuid primary key default gen_random_uuid(), sender_id uuid,
      recipient_id uuid, body text, read_at timestamptz
    );
    create table project_message_groups (id uuid primary key default gen_random_uuid(), opportunity_id text);
    create table project_message_group_members (
      group_id uuid, profile_id uuid, invited_by uuid, primary key(group_id, profile_id)
    );
    alter table project_invitations enable row level security;
    create policy own_invitations on project_invitations for select to authenticated
      using (student_id = auth.uid() or faculty_id = auth.uid());
    alter table research_opportunities enable row level security;
    create policy public_projects on research_opportunities for select to authenticated
      using (visibility = 'public');
    grant usage on schema public, auth to authenticated;
    grant select on research_opportunities, project_invitations to authenticated;
    insert into profiles values ('${faculty}', 'faculty', 'active'),
      ${students.map(id => `('${id}', 'student', 'active')`).join(',')};
    insert into research_opportunities values
      ('private', 'Private research', '${faculty}', 'draft', 1),
      ('public', 'Public research', '${faculty}', 'public', 2);
    insert into project_message_groups (opportunity_id) values ('private');
  `)
  if (acceptedBeforeMigration) {
    await db.exec(`insert into project_invitations (opportunity_id, faculty_id, student_id, status)
      values ('private', '${faculty}', '${students[0]}', 'Accepted');`)
  }
  await db.exec(migration)
  await db.exec(removalMigration)
  return db
}

async function signIn(db, id, restricted = false) {
  await db.exec(`reset role; set request.jwt.claim.sub = '${id}'; ${restricted ? 'set role authenticated;' : ''}`)
}
async function scalar(db, sql) {
  return Object.values((await db.query(sql)).rows[0])[0]
}

for (const studentIdType of ['uuid', 'text']) {
  test(`faculty removal frees capacity and revokes private access (${studentIdType} IDs)`, async () => {
    const db = await fixture(studentIdType, true)
    try {
      await signIn(db, faculty)
      const invitationId = await scalar(db, 'select id from project_invitations')
      await db.exec(`insert into profiles values ('00000000-0000-0000-0000-000000000005', 'faculty', 'active');
        insert into applications (opportunity_id, student_id, status) values ('public', '${students[0]}', 'Accepted');`)
      await signIn(db, '00000000-0000-0000-0000-000000000005', true)
      await assert.rejects(db.exec(`select remove_project_student('private', '${students[0]}');`), /own projects/)
      await signIn(db, students[0], true)
      await assert.rejects(db.exec(`select remove_project_student('private', '${students[0]}');`), /Only faculty/)
      await signIn(db, faculty, true)
      await db.exec(`select remove_project_student('private', '${students[0]}');`)
      await signIn(db, faculty)
      assert.equal(await scalar(db, "select count(*) from applications where opportunity_id = 'private'"), 0)
      assert.equal(await scalar(db, "select count(*) from applications where opportunity_id = 'public'"), 1, 'other projects are unaffected')
      assert.equal(await scalar(db, 'select count(*) from project_invitations'), 0)
      assert.equal(await scalar(db, 'select count(*) from project_message_group_members'), 0)
      await signIn(db, students[0], true)
      assert.equal(await scalar(db, "select count(*) from research_opportunities where id = 'private'"), 0)
      assert.equal(await scalar(db, "select count(*) from student_research_opportunities where id = 'private'"), 0)
      await assert.rejects(db.exec(`select respond_to_project_invitation('${invitationId}', 'Accepted');`), /not available to you/)
      await signIn(db, faculty)
      await db.exec(`select invite_ranked_students('private', array['${students[1]}'::uuid]);`)
      const newInvitation = await scalar(db, 'select id from project_invitations')
      await signIn(db, students[1], true)
      await db.exec(`select respond_to_project_invitation('${newInvitation}', 'Accepted');`)
      assert.equal(await scalar(db, "select remaining_slots from student_research_opportunities where id = 'private'"), 0, 'freed place can be filled again')
    } finally {
      await db.close()
    }
  })

  test(`previously accepted invitations become memberships (${studentIdType} IDs)`, async () => {
    const db = await fixture(studentIdType, true)
    try {
      assert.equal(await scalar(db, "select count(*) from applications where status = 'Accepted'"), 1)
      assert.equal(await scalar(db, 'select count(*) from project_message_group_members'), 1)
      await db.exec(migration)
      assert.equal(await scalar(db, 'select count(*) from applications'), 1, 'rerunning migration does not duplicate memberships')
      await signIn(db, students[0], true)
      assert.equal(await scalar(db, "select remaining_slots from student_research_opportunities where id = 'private'"), 0)
    } finally {
      await db.close()
    }
  })

  test(`private invitations enforce privacy, membership and capacity (${studentIdType} IDs)`, async () => {
    const db = await fixture(studentIdType)
    try {
      await signIn(db, faculty)
      await db.exec(`select invite_ranked_students('private', array['${students[0]}'::uuid, '${students[1]}'::uuid]);`)
      const invitations = (await db.query('select id, student_id from project_invitations order by student_id')).rows
      assert.equal(await scalar(db, 'select count(*) from direct_messages'), 2, 'sent invitations create notifications')
      const messageId = await scalar(db, `select id from direct_messages where recipient_id = '${students[0]}'`)

      await signIn(db, students[2], true)
      assert.equal(await scalar(db, "select count(*) from research_opportunities where id = 'private'"), 0)
      assert.equal(await scalar(db, "select count(*) from student_research_opportunities where id = 'private'"), 0)
      await assert.rejects(db.exec(`select respond_to_project_invitation('${invitations[0].id}', 'Accepted');`), /not available to you/)
      await db.exec(`select mark_project_invitation_notification_read('${messageId}');`)
      await signIn(db, faculty)
      assert.equal(await scalar(db, `select read_at from direct_messages where id = '${messageId}'`), null, 'others cannot dismiss a notification')

      await signIn(db, students[0], true)
      assert.equal(await scalar(db, "select count(*) from research_opportunities where id = 'private'"), 1, 'invitee can read private details')
      await assert.rejects(db.exec("update project_invitations set status = 'Accepted'"), /permission denied/)
      await db.exec(`select respond_to_project_invitation('${invitations[0].id}', 'Accepted');`)
      await db.exec(`select mark_project_invitation_notification_read('${messageId}');`)
      assert.equal(await scalar(db, "select remaining_slots from student_research_opportunities where id = 'private'"), 0)
      await db.exec(`select respond_to_project_invitation('${invitations[0].id}', 'Accepted');`)

      await signIn(db, faculty)
      assert.ok(await scalar(db, `select read_at from direct_messages where id = '${messageId}'`), 'recipient can dismiss an invitation notification')
      assert.equal(await scalar(db, "select count(*) from applications where status = 'Accepted'"), 1)
      assert.equal(await scalar(db, 'select count(*) from project_message_group_members'), 1)
      assert.equal(await scalar(db, 'select count(*) from direct_messages'), 3, 'duplicate acceptance does not duplicate notifications')
      await db.exec(`select invite_ranked_students('private', array['${students[0]}'::uuid]);`)
      assert.equal(await scalar(db, 'select count(*) from direct_messages'), 3, 'accepted invite is preserved')

      await signIn(db, students[1], true)
      await assert.rejects(db.exec(`select respond_to_project_invitation('${invitations[1].id}', 'Accepted');`), /project is full/)
      assert.equal(await scalar(db, 'select status from project_invitations'), 'Pending', 'failed acceptance leaves invitation pending')
      await db.exec(`select respond_to_project_invitation('${invitations[1].id}', 'Rejected', 'No time');`)
      assert.equal(await scalar(db, "select count(*) from research_opportunities where id = 'private'"), 0)
      await signIn(db, students[2], true)
      assert.equal(await scalar(db, "select count(*) from student_research_opportunities where id = 'private'"), 0, 'accepted private project remains hidden from others')
    } finally {
      await db.close()
    }
  })

  test(`acceptance reuses reserved applications and reclaims rejected places (${studentIdType} IDs)`, async () => {
    const db = await fixture(studentIdType)
    try {
      await signIn(db, faculty)
      await db.exec(`select invite_ranked_students('private', array['${students[0]}'::uuid]);
        insert into applications (opportunity_id, student_id, status) values ('private', '${students[0]}', 'Submitted');`)
      const invitationId = await scalar(db, 'select id from project_invitations')
      await signIn(db, students[0], true)
      await db.exec(`select respond_to_project_invitation('${invitationId}', 'Accepted');`)
      await signIn(db, faculty)
      assert.equal(await scalar(db, 'select count(*) from applications'), 1)
      assert.equal(await scalar(db, 'select status from applications'), 'Accepted')

      await db.exec(`select invite_ranked_students('public', array['${students[1]}'::uuid]);
        insert into applications (opportunity_id, student_id, status) values ('public', '${students[1]}', 'Rejected');`)
      const rejectedId = await scalar(db, "select id from project_invitations where opportunity_id = 'public'")
      await signIn(db, students[1], true)
      await db.exec(`select respond_to_project_invitation('${rejectedId}', 'Accepted');`)
      assert.equal(await scalar(db, "select remaining_slots from student_research_opportunities where id = 'public'"), 1)
      await signIn(db, faculty)
      assert.equal(await scalar(db, "select count(*) from applications where opportunity_id = 'public'"), 1)
    } finally {
      await db.close()
    }
  })
}

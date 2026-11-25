import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE_PATH).href)
test('database blocks incomplete profiles but allows profile edits and completed interactions', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create function auth.uid() returns uuid language sql as $$ select '00000000-0000-0000-0000-000000000001'::uuid $$;
      create function auth.role() returns text language sql as $$ select 'authenticated'::text $$;
      create table profiles(id uuid primary key, role text, department text, bio text, research_experience text, skills text[], research_interests text[], major text, year_of_study text, gpa numeric);
      create table research_ideas(id int primary key);
      create table direct_messages(id int primary key);
      insert into profiles(id, role) values(auth.uid(), 'student');`)
    await db.exec(await readFile(new URL('../migrations/20261011_require_complete_profiles.sql', import.meta.url), 'utf8'))
    await assert.rejects(db.exec('insert into research_ideas values(1)'), /Complete your profile/)
    await assert.rejects(db.exec('insert into direct_messages values(1)'), /Complete your profile/)
    await db.exec("update profiles set department='CS', bio='Research interests', skills=array['Python'], research_interests=array['AI'], major='CS', year_of_study='Senior', gpa=0")
    await db.exec('insert into research_ideas values(1); insert into direct_messages values(1)')
    await db.exec("update profiles set role='faculty', research_experience='Research background', major=null, gpa=null")
    await db.exec('insert into research_ideas values(2)')
    await db.exec('update profiles set skills=null')
    await assert.rejects(db.exec('insert into research_ideas values(3)'), /Complete your profile/)
  } finally { await db.close() }
})

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

const { PGlite } = await import(process.env.PGLITE_MODULE_PATH
  ? pathToFileURL(process.env.PGLITE_MODULE_PATH).href : '@electric-sql/pglite')
const migration = await readFile(new URL('../migrations/20261010_self_registration_consent.sql', import.meta.url), 'utf8')

test('registration requires consent, restricts roles, and creates profiles atomically', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create function auth.role() returns text language sql as
        $$ select current_setting('request.jwt.claim.role', true) $$;
      create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
      create table public.profiles (
        id uuid primary key references auth.users(id), full_name text not null,
        email text not null, university_id text unique not null,
        role text not null check (role in ('student', 'faculty', 'admin'))
      );
      select set_config('request.jwt.claim.role', 'anon', false);
    `)
    await db.exec(migration)
    await db.exec(migration)
    let sequence = 0
    const base = { full_name: 'Test User', university_id: '202312345', role: 'student',
      research_background_consent: true, research_background_consent_version: 'hub-only-v1' }
    const insert = (metadata, email = '202312345@uaeu.ac.ae') => db.query(
      'insert into auth.users values ($1, $2, $3)',
      [`00000000-0000-0000-0000-${String(++sequence).padStart(12, '0')}`, email, JSON.stringify(metadata)])
    for (const consent of [undefined, false, 'true']) {
      await assert.rejects(insert({ ...base, research_background_consent: consent }), /must accept/)
    }
    await assert.rejects(insert(base, 'test@example.com'), /UAEU email/)
    await insert({ ...base, role: 'admin' })
    await insert({ ...base, role: 'student', university_id: '202312346' }, 'Faculty@uaeu.ac.ae')
    const { rows } = await db.query('select role, research_background_consent_at, research_background_consent_version from profiles order by role')
    assert.deepEqual(rows.map(row => row.role), ['faculty', 'student'])
    assert.ok(rows.every(row => row.research_background_consent_at && row.research_background_consent_version === 'hub-only-v1'))
    await assert.rejects(insert(base), /unique/)
    assert.equal((await db.query('select count(*)::int as count from auth.users')).rows[0].count, 2)
    await assert.rejects(insert({ ...base, university_id: '' }), /nine-digit university ID/)
    await assert.rejects(insert({ ...base, role: 'faculty', university_id: '123' }, 'name@uaeu.ac.ae'), /nine digits/)
    await assert.rejects(insert({ ...base, role: 'faculty', university_id: '' }, ''), /UAEU email/)
    await assert.rejects(insert({ ...base, role: 'faculty', university_id: '' }), /nine-digit university ID/)
    await assert.rejects(insert(base, '_name@uaeu.ac.ae'), /UAEU email/)
    await insert({ ...base, role: 'faculty', university_id: '' }, 'name@uaeu.ac.ae')
    await insert({ ...base, role: 'faculty', university_id: null }, 'other@uaeu.ac.ae')
    assert.equal((await db.query('select count(*)::int as count from profiles where university_id is null')).rows[0].count, 2)
    await db.exec("select set_config('request.jwt.claim.role', 'service_role', false)")
    await insert({ full_name: 'Admin-created account' })
    assert.equal((await db.query('select count(*)::int as count from auth.users')).rows[0].count, 5)
  } finally {
    await db.close()
  }
})

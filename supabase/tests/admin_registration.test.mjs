import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import test from 'node:test'
const {PGlite}=await import(process.env.PGLITE_MODULE_PATH ? pathToFileURL(process.env.PGLITE_MODULE_PATH).href : '@electric-sql/pglite')
test('admin registration works before app metadata is set without bypassing public consent',async()=>{
 const db=new PGlite()
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create function auth.role() returns text language sql as $$ select ''::text $$;
 create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb,raw_app_meta_data jsonb default '{}'::jsonb);
 create table profiles(id uuid primary key references auth.users(id),full_name text not null,email text,university_id text unique not null,role text);
 grant usage on schema auth to authenticated;grant insert on auth.users to authenticated;`)
 const migration=await readFile(new URL('../migrations/20261116_admin_registration_authorizations.sql',import.meta.url),'utf8')
 await db.exec(migration);await db.exec(migration)
 const id='00000000-0000-0000-0000-000000000001'
 const meta={full_name:'Test Faculty',role:'faculty',university_id:null}
 const insert=(metadata=meta,email='test@uaeu.ac.ae')=>db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)',[id,email,JSON.stringify(metadata)])
 await assert.rejects(insert({...meta,hub_admin_created:true}),/must accept/)
 await db.exec(`set role authenticated`)
 await assert.rejects(db.query('insert into hub_admin_registration_authorizations(user_id,email,role) values($1,$2,$3)',[id,'test@uaeu.ac.ae','faculty']),/permission denied/)
 await db.exec('reset role')
 await db.query('insert into hub_admin_registration_authorizations(user_id,email,role) values($1,$2,$3)',[id,'test@uaeu.ac.ae','faculty'])
 await assert.rejects(insert(meta,'someone@uaeu.ac.ae'),/must accept/)
 await assert.rejects(insert({...meta,role:'admin'}),/must accept/)
 await db.exec("update hub_admin_registration_authorizations set expires_at=now()-interval '1 minute'")
 await assert.rejects(insert(),/must accept/)
 await db.exec("update hub_admin_registration_authorizations set expires_at=now()+interval '5 minutes'")
 await insert()
 assert.equal((await db.query('select count(*)::int as n from hub_admin_registration_authorizations')).rows[0].n,0)
 assert.equal((await db.query('select count(*)::int as n from profiles')).rows[0].n,0)
 await db.query('insert into profiles(id,full_name,email,role,university_id) values($1,$2,$3,$4,null)',[id,meta.full_name,'test@uaeu.ac.ae','faculty'])
 await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)',['00000000-0000-0000-0000-000000000002','public@uaeu.ac.ae',JSON.stringify({...meta,research_background_consent:true,research_background_consent_version:'hub-only-v1'})])
 assert.equal((await db.query('select count(*)::int as n from profiles')).rows[0].n,2)
 }finally{await db.close()}
})

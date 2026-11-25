import test from 'node:test'
import assert from 'node:assert/strict'
import {createAuthStorage} from './authStorage.js'
const storage=()=>{const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)}}
test('unchecked login survives reload but not a new browser session',()=>{
 const local=storage(),session=storage();const auth=createAuthStorage(local,session)
 auth.setRememberSession(false);auth.setItem('token','temporary')
 assert.equal(local.getItem('token'),null)
 assert.equal(createAuthStorage(local,session).getItem('token'),'temporary')
 assert.equal(createAuthStorage(local,storage()).getItem('token'),null)
})
test('checked login persists and sign-out removes both copies',()=>{
 const local=storage(),session=storage();const auth=createAuthStorage(local,session)
 auth.setRememberSession(true);auth.setItem('token','persistent')
 assert.equal(createAuthStorage(local,storage()).getItem('token'),'persistent')
 session.setItem('token','temporary');auth.removeItem('token')
 assert.equal(local.getItem('token'),null);assert.equal(session.getItem('token'),null)
})
test('switching to an unchecked login removes previous persistent credentials',()=>{
 const local=storage(),session=storage();const auth=createAuthStorage(local,session)
 local.setItem('token','old');auth.setRememberSession(false)
 assert.equal(auth.getItem('token'),null)
 auth.setItem('token','new');assert.equal(local.getItem('token'),null)
 assert.equal(session.getItem('token'),'new')
})

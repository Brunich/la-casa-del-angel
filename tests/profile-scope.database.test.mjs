import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import pg from 'pg';

const connectionString=process.env.CARE_TEST_DATABASE_URL;
const enabled=Boolean(connectionString&&process.env.CARE_TEST_DISPOSABLE==='yes');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('atomic profile scope and scoped self registration on a separate disposable Supabase database',{skip:!enabled&&'Requires CARE_TEST_DATABASE_URL and CARE_TEST_DISPOSABLE=yes; never use the live project'},async()=>{
 const admin=new pg.Client({connectionString}),clients=[];
 await admin.connect();
 const as=async n=>{const c=new pg.Client({connectionString});await c.connect();clients.push(c);await c.query('set role authenticated');await c.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id(n),role:'authenticated',aal:'aal2'})]);return c;};
 const denied=p=>assert.rejects(p,e=>['42501','22023'].includes(e.code));
 const scope=(c,user,role,site=null,resident=null,active=true,verified=true)=>c.query('select public.manage_profile_and_scope($1,$2,$3,$4,$5,$6,$7)',[id(user),'Synthetic scope test',role,active,site&&id(site),resident&&id(resident),verified]);
 try{
  assert.equal((await admin.query("select to_regclass('public.profiles') present")).rows[0].present,null,'Requires a separate empty disposable database');
  for(const file of ['migrations/001_care.sql','tests/fixtures.sql'])await admin.query(await readFile(new URL(`../supabase/${file}`,import.meta.url),'utf8'));
  await admin.query("update auth.users set email_confirmed_at=now() where id=any($1::uuid[])",[[id(1),id(2),id(3),id(5)]]);
  const owner=await as(1),manager=await as(2);
  await admin.query(await readFile(new URL('../supabase/migrations/20261009215103_profile_scope.sql',import.meta.url),'utf8'));
  await scope(owner,3,'nurse',9);
  assert.equal((await admin.query('select count(*)::int n from public.resident_access where user_id=$1',[id(3)])).rows[0].n,2,'Existing nurse keeps residents within selected site');
  await scope(owner,3,'nurse',10);
  assert.equal((await admin.query('select count(*)::int n from public.resident_access where user_id=$1',[id(3)])).rows[0].n,0,'Changing site revokes prior resident access');
  await scope(owner,3,'family',9,11);
  assert.equal((await admin.query('select count(*)::int n from public.staff_sites where user_id=$1',[id(3)])).rows[0].n,0);
  assert.deepEqual((await admin.query('select resident_id from public.resident_access where user_id=$1',[id(3)])).rows,[{resident_id:id(11)}]);
  await denied(scope(owner,3,'family',10,11));
  assert.equal((await admin.query('select role from public.profiles where id=$1',[id(3)])).rows[0].role,'family','Invalid scope leaves profile unchanged');
  assert.deepEqual((await admin.query('select resident_id from public.resident_access where user_id=$1',[id(3)])).rows,[{resident_id:id(11)}],'Invalid scope keeps prior access intact');
  await denied(scope(manager,5,'family',9,11));
  await denied(scope(owner,5,'family',9,11,true,false));
  await denied(scope(owner,2,'manager'));
  await denied(scope(owner,5,'patient',9,11));
  await denied(scope(owner,1,'manager',9));
  await denied(scope(owner,1,'owner',null,null,false));
  await denied(owner.query('select public.manage_profile($1,$2,$3,true)',[id(2),'Legacy','owner']));
  await scope(owner,3,'family',9,11,false);
  const suspended=await as(3);
  assert.equal((await suspended.query('select count(*)::int n from public.residents')).rows[0].n,0,'Disabled profile cannot use preserved scope');
  await scope(owner,3,'owner');
  assert.equal((await admin.query('select count(*)::int n from public.resident_access where user_id=$1',[id(3)])).rows[0].n,0);
  for(const file of ['20261009205118_manager_onboarding.sql','20261009210813_account_directory.sql','20261009212020_invitation_scope.sql','20261009220234_self_registration.sql'])await admin.query(await readFile(new URL(`../supabase/migrations/${file}`,import.meta.url),'utf8'));
  for(const [number,site,confirmed] of [[21,id(9),true],[22,id(10),true],[23,null,true],[24,'invalid-site',true],[25,id(9),false]]){
   await admin.query('insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,$3,$4)',[id(number),`registration-${number}@example.invalid`,confirmed?new Date():null,{full_name:'Registration test',requested_site_id:site,role:'owner'}]);
  }
  const pending=await as(21);
  assert.equal((await pending.query('select public.get_my_access_status() status')).rows[0].status,'pending');
  assert.equal((await pending.query('select count(*)::int n from public.residents')).rows[0].n,0,'Self-requested metadata role grants no clinical access');
  await denied(pending.query('select * from public.get_admin_accounts()'));
  await denied(pending.query('select * from public.get_resident_timeline($1)',[id(11)]));
  const pendingIds=(await manager.query('select id from public.get_admin_accounts() where role is null')).rows.map(r=>r.id);
  assert.deepEqual(pendingIds,[id(21)],'Manager cannot see another site, no site, malformed metadata or unconfirmed registrations');
  assert.equal((await owner.query('select count(*)::int n from public.get_admin_accounts() where role is null')).rows[0].n,5,'Direction can review all requests');
  await denied(manager.query('select public.onboard_care_account($1,$2,$3,null,$4,true)',['registration-22@example.invalid','Registration test','nurse',id(9)]));
  await denied(manager.query('select public.onboard_care_account($1,$2,$3,null,$4,true)',['registration-23@example.invalid','Registration test','nurse',id(9)]));
  await denied(manager.query('select public.onboard_care_account($1,$2,$3,null,$4,false)',['registration-21@example.invalid','Registration test','nurse',id(9)]));
  await manager.query('select public.onboard_care_account($1,$2,$3,null,$4,true)',['registration-21@example.invalid','Registration test','nurse',id(9)]);
  assert.deepEqual((await admin.query('select site_id from public.staff_sites where user_id=$1',[id(21)])).rows,[{site_id:id(9)}]);
 }finally{await Promise.all(clients.map(c=>c.end()));await admin.end();}
});

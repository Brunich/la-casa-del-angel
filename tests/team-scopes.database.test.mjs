import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import pg from 'pg';

// These are real PostgreSQL/RLS tests, exclusively on a separate empty,
// explicitly disposable Supabase database. No production data or mock backend.
const connectionString=process.env.CARE_TEST_DATABASE_URL;
const enabled=Boolean(connectionString&&process.env.CARE_TEST_DISPOSABLE==='yes');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const source=file=>readFile(new URL(`../supabase/${file}`,import.meta.url),'utf8');

test('multi-site roles, atomic scope replacement, onboarding and private nursing team',{
 skip:!enabled&&'Requires a separate empty Supabase database: CARE_TEST_DATABASE_URL and CARE_TEST_DISPOSABLE=yes',
},async()=>{
 const admin=new pg.Client({connectionString}),clients=[];
 await admin.connect();
 const as=async(number,role='authenticated')=>{
  const c=new pg.Client({connectionString});await c.connect();clients.push(c);
  await c.query(`set role ${role==='anon'?'anon':'authenticated'}`);
  await c.query("select set_config('request.jwt.claims',$1,false)",[
   JSON.stringify(number?{sub:id(number),role,aal:'aal1'}:{role}),
  ]);return c;
 };
 const denied=p=>assert.rejects(p,e=>['42501','22023'].includes(e.code));
 const scope=(c,n,role,sites=[],residents=[],active=true,verified=true)=>c.query(
  'select public.manage_profile_scopes($1,$2,$3,$4,$5,$6,$7)',
  [id(n),'Disposable scope test',role,active,sites.map(id),residents.map(id),verified]);
 const grant=(c,n,sites,residents=[],role='nurse',verified=true)=>c.query(
  'select public.onboard_care_scopes($1,$2,$3,$4,$5,$6)',
  [`team-${n}@example.invalid`,'Disposable onboarding test',role,sites.map(id),residents.map(id),verified]);
 const bulk=(c,n,site,grant=true)=>c.query('select public.set_nurse_sector_access($1,$2,$3)',[id(n),id(site),grant]);
 const team=async c=>(await c.query('select public.get_my_team() team')).rows[0].team;
 const assignments=async n=>(await admin.query(
  'select resident_id from public.resident_access where user_id=$1 order by resident_id',[id(n)]
 )).rows.map(r=>r.resident_id);
 try{
  assert.equal((await admin.query("select to_regclass('public.profiles') present")).rows[0].present,null,
   'Refuse a database with an existing care schema');
  assert.ok((await admin.query("select to_regclass('auth.users') users, to_regclass('storage.objects') objects")).rows[0].users,
   'Use actual Supabase Auth/Storage migrations, not substitute tables');
  await admin.query(await source('migrations/001_care.sql'));
  await admin.query(await source('tests/fixtures.sql'));
  // The original fixture contains the historical patient role; current product
  // uses family only. Change that test profile before applying its real constraint.
  await admin.query("update public.profiles set role='family' where role='patient'");
  await admin.query("update auth.users set email='team-'||right(id::text,1)||'@example.invalid',email_confirmed_at=now()");
  await admin.query(`insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at)
   select gen_random_uuid(),id,'totp','verified',now(),now() from public.profiles where role in ('owner','manager','nurse')`);
  for(const file of [
   '20261009205118_manager_onboarding.sql','20261009205925_initial_mfa_policy.sql',
   '20261009210813_account_directory.sql','20261009212020_invitation_scope.sql',
   '20261009215103_profile_scope.sql','20261009220234_self_registration.sql',
   '20261010001415_team_scopes.sql','20261010002337_suspend_unassigned_profile.sql',
  ])await admin.query(await source(`migrations/${file}`));
  const owner=await as(1),manager=await as(2),nurse=await as(3),family=await as(5),anon=await as(null,'anon');
  await denied(team(anon));
  await denied(scope(manager,3,'nurse',[9],[11]));
  await denied(scope(owner,1,'manager',[9]));
  await denied(scope(owner,1,'owner',[],[],false));
  await denied(scope(owner,3,'nurse',[9],[11],true,false));
  await scope(owner,3,'nurse',[9,10],[11,12]);
  assert.deepEqual(await assignments(3),[id(11),id(12)]);
  await denied(scope(owner,3,'nurse',[9],[11,12]));
  assert.deepEqual(await assignments(3),[id(11),id(12)],'Invalid cross-site input changes no assignment');
  assert.equal((await admin.query('select role from public.profiles where id=$1',[id(3)])).rows[0].role,'nurse');
  await scope(owner,5,'family',[9,10],[11,12]);
  assert.equal((await admin.query('select count(*)::int n from public.staff_sites where user_id=$1',[id(5)])).rows[0].n,0);
  assert.deepEqual((await family.query('select id from public.residents order by id')).rows.map(r=>r.id),[id(11),id(12)]);
  await denied(team(family));
  await denied(scope(owner,5,'family',[9,10],[11]));
  assert.deepEqual(await assignments(5),[id(11),id(12)],'Unused family site is rejected atomically');
  await scope(owner,4,'nurse',[9],[13]);
  const nursingTeam=await team(nurse),peer=nursingTeam.staff.find(p=>p.id===id(4));
  assert.deepEqual(nursingTeam.residents.map(r=>r.id).sort(),[id(11),id(12)]);
  assert.deepEqual(peer.resident_ids,[],'Other nurse resident identity is not exposed');
  assert.equal(peer.assigned_count,1,'Only the assigned count is exposed');
  assert.equal(JSON.stringify(nursingTeam).includes(id(13)),false);
  assert.equal(JSON.stringify(nursingTeam).includes('email'),false);
  await denied(bulk(nurse,3,9));
  await denied(bulk(manager,3,10));
  await bulk(manager,3,9);
  assert.deepEqual(await assignments(3),[id(11),id(12),id(13)]);
  await bulk(manager,3,9,false);
  assert.deepEqual(await assignments(3),[id(12)],'Sector revoke preserves another sector');
  await denied(bulk(manager,4,10));
  for(const [number,site,confirmed] of [[21,9,true],[22,10,true],[23,null,true],[24,9,false]]){
   await admin.query('insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,$3,$4)',[
    id(number),`team-${number}@example.invalid`,confirmed?new Date():null,{full_name:'Disposable pending account',requested_site_id:site&&id(site)},
   ]);
  }
  await denied(grant(manager,21,[9,10],[11,12]));
  await denied(grant(manager,22,[9],[11]));
  await denied(grant(manager,23,[9],[11]));
  await denied(grant(owner,24,[9],[11]));
  await denied(grant(manager,21,[9],[11],'owner'));
  await denied(grant(manager,21,[9],[11],'nurse',false));
  await grant(manager,21,[9],[11]);
  const withoutMfa=await as(21);
  assert.equal((await withoutMfa.query('select count(*)::int n from public.residents')).rows[0].n,0,
   'Confirmed staff approval alone does not bypass initial MFA enrollment');
  await denied(team(withoutMfa));
  await scope(owner,2,'manager',[9,10]);
  await grant(manager,21,[10],[12]);
  assert.deepEqual(await assignments(21),[id(11),id(12)],'Multi-site additive onboarding preserves previous site');
  await scope(owner,2,'manager',[9]);
  await denied(grant(manager,21,[10],[12]));
  await scope(owner,3,'owner');
  assert.deepEqual(await assignments(3),[],'Promotion to direction removes prior resident-specific scopes');
  assert.equal((await admin.query('select count(*)::int n from public.staff_sites where user_id=$1',[id(3)])).rows[0].n,0);
  await scope(owner,3,'nurse',[10],[12],false);
  assert.equal((await nurse.query('select count(*)::int n from public.residents')).rows[0].n,0,'Revoked active status removes clinical access');
  await denied(team(nurse));
  for(const role of ['manager','nurse','family']){
   await scope(owner,3,role,[],[],false);
   assert.deepEqual(await assignments(3),[],'Suspension accepts an already empty resident scope');
   assert.equal((await admin.query('select count(*)::int n from public.staff_sites where user_id=$1',[id(3)])).rows[0].n,0);
   await denied(scope(owner,3,role,[],[],true));
  }
  await denied(scope(owner,3,'family',[9],[],false));
  await denied(scope(owner,3,'family',[],[11],false));
 }finally{
  await Promise.all(clients.map(c=>c.end()));await admin.end();
 }
});

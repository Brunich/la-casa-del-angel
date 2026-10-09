import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

// Only a disposable, empty Supabase PostgreSQL database. Never use production.
const connectionString = process.env.CARE_TEST_DATABASE_URL;
const enabled = Boolean(connectionString && process.env.CARE_TEST_DISPOSABLE === 'yes');
const sql = name => readFile(new URL(`../supabase/${name}`, import.meta.url), 'utf8');
const ids = Object.fromEntries(['owner', 'manager', 'nurse', 'otherNurse', 'family', 'patient', 'otherFamily', 'inactive', 'site', 'otherSite', 'resident', 'otherResident', 'noConsent', 'plan', 'otherPlan'].map((name, i) => [name, `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`]));
const request = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test('PostgreSQL authorization, atomic medication ledger and reminders', { skip: !enabled && 'Set CARE_TEST_DATABASE_URL and CARE_TEST_DISPOSABLE=yes to run real PostgreSQL tests' }, async t => {
  const admin = new pg.Client({ connectionString });
  await admin.connect();
  const clients = [];
  const as = async (user, aal = ['family','patient','otherFamily'].includes(user) ? 'aal1' : 'aal2') => {
    const client = new pg.Client({ connectionString });
    await client.connect();
    clients.push(client);
    await client.query('set role authenticated');
    await client.query("select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)", [ids[user], JSON.stringify({ sub: ids[user], role: 'authenticated', aal })]);
    return client;
  };
  const denied = async promise => assert.rejects(promise, error => ['42501', 'P0001', '23514', '22023'].includes(error.code));
  const recordedAt = new Date();
  const record = (client, { resident = ids.resident, kind = 'medication', status = 'administered', req = request(1), plan = ids.plan, units = 1, photo = `${ids.resident}/${request(100)}.jpg`, occurred = recordedAt, notes = null, extra = {} } = {}) => client.query('select public.record_care_event($1,$2,$3,$4,$5,$6,$7,$8) id', [resident, kind, occurred, notes, { request_id: req, status, ...extra }, photo, plan, units]);
  try {
    const existing = await admin.query("select to_regclass('public.profiles') as present");
    assert.equal(existing.rows[0].present, null, 'The test database must be empty; schema is not dropped automatically');
    const platform = await admin.query("select to_regclass('auth.users') as users, to_regclass('storage.objects') as objects");
    assert.ok(platform.rows[0].users && platform.rows[0].objects, 'Use an actual local/disposable Supabase database with auth and storage migrations applied');
    await admin.query(await sql('migrations/001_care.sql'));
    await admin.query(await sql('tests/fixtures.sql'));
    const nurse = await as('nurse');
    const family = await as('family');
    const outsider = await as('otherNurse');
    const manager = await as('manager');
    const owner = await as('owner');
    const patient = await as('patient');
    const otherFamily = await as('otherFamily');
    await t.test('staff aal1 can enroll from self profile but cannot access clinical data or record', async () => {
      const aal1Nurse = await as('nurse','aal1');
      assert.equal((await aal1Nurse.query('select count(*)::int n from public.profiles')).rows[0].n,1);
      assert.equal((await aal1Nurse.query('select count(*)::int n from public.residents')).rows[0].n,0);
      await denied(aal1Nurse.query('select public.get_resident_timeline($1)', [ids.resident]));
      await denied(record(aal1Nurse));
      const aal1Owner = await as('owner','aal1');
      await denied(aal1Owner.query('select public.manage_profile($1,$2,$3,true)',[ids.manager,'Manager','owner']));
    });
    await t.test('family reads only linked resident and audited timeline, no role escalation or direct clinical read', async () => {
      const rows = await family.query('select id from public.residents');
      assert.deepEqual(rows.rows.map(r => r.id), [ids.resident]);
      await denied(family.query('select * from public.care_events'));
      await denied(family.query('update public.profiles set role = \'owner\' where id = $1', [ids.family]));
      await denied(family.query('select public.get_resident_timeline($1)', [ids.otherResident]));
      await family.query('select * from public.get_resident_timeline($1)', [ids.resident]);
      assert.equal((await admin.query("select count(*)::int n from public.audit_log where actor_id=$1 and action='timeline.read'", [ids.family])).rows[0].n, 1);
      assert.equal((await family.query('select count(*)::int n from public.profiles')).rows[0].n, 1);
      await denied(record(family));
      await denied(family.query('insert into public.resident_access values ($1,$2)', [ids.otherResident, ids.family]));
    });
    await t.test('patient and second family are isolated to their explicit resident links', async () => {
      assert.deepEqual((await patient.query('select id from public.residents')).rows.map(r=>r.id),[ids.resident]);
      assert.deepEqual((await otherFamily.query('select id from public.residents')).rows.map(r=>r.id),[ids.otherResident]);
      await patient.query('select * from public.get_resident_timeline($1)',[ids.resident]);
      await patient.query('select * from public.get_medication_plans($1)',[ids.resident]);
      await otherFamily.query('select * from public.get_medication_plans($1)',[ids.otherResident]);
      await denied(patient.query('select public.get_resident_timeline($1)',[ids.otherResident]));
      await denied(otherFamily.query('select public.get_resident_timeline($1)',[ids.resident]));
      await denied(otherFamily.query('select public.get_medication_plans($1)',[ids.resident]));
      await denied(record(patient));
      await denied(record(otherFamily,{resident:ids.otherResident}));
    });
    await t.test('all-resident medication query only returns active plans the actor can read and audits access', async () => {
      for(const [client,expected] of [[family,[ids.plan]],[patient,[ids.plan]],[otherFamily,[ids.otherPlan]],[nurse,[ids.plan]],[owner,[ids.plan,ids.otherPlan]]]) {
        const plans=await client.query('select * from public.get_accessible_medication_plans()');
        assert.deepEqual(plans.rows.map(p=>p.id).sort(),expected.sort());
      }
      const inactive=await as('inactive');
      const aal1Nurse=await as('nurse','aal1');
      await denied(inactive.query('select * from public.get_accessible_medication_plans()'));
      await denied(aal1Nurse.query('select * from public.get_accessible_medication_plans()'));
      assert.equal((await admin.query("select count(*)::int n from public.audit_log where actor_id=$1 and action='medications.accessible.read'",[ids.patient])).rows[0].n,1);
      await admin.query('update public.medication_plans set active=false where id=$1',[ids.plan]);
      try {
        assert.equal((await patient.query('select * from public.get_accessible_medication_plans()')).rowCount,0);
      } finally { await admin.query('update public.medication_plans set active=true where id=$1',[ids.plan]); }
    });
    await t.test('site and explicit nurse assignment enforced; inactive accounts and anonymous calls denied', async () => {
      await denied(record(outsider));
      await denied(record(nurse, { resident: ids.otherResident, photo: null }));
      const inactive = await as('inactive');
      await denied(record(inactive));
      await denied(inactive.query('select public.get_resident_timeline($1)', [ids.resident]));
      await denied(inactive.query('select public.get_medication_plans($1)', [ids.resident]));
      await denied(inactive.query('select * from public.get_medication_movements($1)',[ids.resident]));
      const anon = new pg.Client({ connectionString });
      await anon.connect(); clients.push(anon); await anon.query('set role anon');
      await denied(anon.query('select public.get_resident_timeline($1)', [ids.resident]));
      await denied(anon.query('select * from public.get_accessible_medication_plans()'));
      await denied(anon.query('select * from public.get_medication_movements($1)',[ids.resident]));
      await denied(anon.query('select public.cancel_reminder($1)',[request(110)]));
    });
    await t.test('administration requires valid units, uploaded own photo, consent and prescribed plan', async () => {
      await denied(record(nurse, { req: request(2), units: 2 }));
      await denied(record(nurse, { req: request(3), plan: ids.otherPlan }));
      await denied(record(nurse, { req: request(4), photo: null }));
      await denied(record(nurse, { req: request(5), photo: `${ids.resident}/${request(999)}.jpg` }));
      await denied(record(nurse, { req: request(6), photo: `${ids.resident}/${request(101)}.jpg` }));
      await denied(record(nurse, { req: request(7), extra: { medication_name: 'forged' } }));
      assert.equal(Number((await admin.query('select stock_remaining from public.medication_plans where id=$1', [ids.plan])).rows[0].stock_remaining), 3);
    });
    await t.test('same request racing is one event and one stock movement', async () => {
      const secondNurse = await as('nurse');
      const results = await Promise.all([record(nurse), record(secondNurse)]);
      assert.equal(results[0].rows[0].id, results[1].rows[0].id);
      const ev = await admin.query('select * from public.care_events where id=$1', [results[0].rows[0].id]);
      assert.equal(ev.rows[0].details.medication_name, 'Tratamiento de prueba');
      assert.equal(ev.rows[0].details.dose_amount, 500);
      assert.equal(ev.rows[0].details.inventory_units, 1);
      assert.equal(Number((await admin.query('select stock_remaining from public.medication_plans where id=$1', [ids.plan])).rows[0].stock_remaining), 2);
      assert.equal((await admin.query('select count(*)::int n from public.medication_movements where event_id=$1', [ev.rows[0].id])).rows[0].n, 1);
      await denied(record(nurse, { units: 2 }));
    });
    await t.test('two requests racing cannot consume unavailable stock; failed RPC rolls back everything', async () => {
      await admin.query('update public.medication_plans set stock_remaining=1 where id=$1', [ids.plan]);
      const secondNurse = await as('nurse');
      const results = await Promise.allSettled([record(nurse, { req: request(20) }), record(secondNurse, { req: request(21) })]);
      assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
      assert.equal(results.filter(r => r.status === 'rejected').length, 1);
      assert.equal(Number((await admin.query('select stock_remaining from public.medication_plans where id=$1', [ids.plan])).rows[0].stock_remaining), 0);
      assert.equal((await admin.query("select count(*)::int n from public.care_events where details->>'request_id' in ($1,$2)", [request(20), request(21)])).rows[0].n, 1);
    });
    await t.test('refused medication records do not consume inventory and no-consent recording needs reason', async () => {
      await denied(record(nurse, { req: request(35), status: 'rejected', units: null, photo: null }));
      await denied(record(nurse, { req: request(37), status: 'refused', units: null, photo: null }));
      await denied(record(nurse, { req: request(38), status: 'omitted', units: null, photo: null, notes:'   ' }));
      await record(nurse, { req: request(30), status: 'refused', units: null, photo: null, notes:'El residente rechazó la toma.' });
      await record(nurse, { req: request(36), status: 'omitted', units: null, photo: null, notes:'Se documentó la omisión de la toma.' });
      assert.equal(Number((await admin.query('select stock_remaining from public.medication_plans where id=$1', [ids.plan])).rows[0].stock_remaining), 0);
      assert.equal((await admin.query("select count(*)::int n from public.medication_movements m join public.care_events e on e.id=m.event_id where e.details->>'request_id' in ($1,$2)",[request(30),request(36)])).rows[0].n,0);
      await denied(record(nurse, { resident: ids.noConsent, req: request(31), plan: null, photo: null }));
      await admin.query("insert into public.medication_plans(id,resident_id,name,dose_amount,dose_unit,stock_unit,units_per_dose,stock_remaining) values ($1,$2,'Sin foto',1,'mg','tableta',1,2)", [request(32), ids.noConsent]);
      await denied(record(nurse, { resident: ids.noConsent, req: request(34), plan: request(32), photo: null }));
      await record(nurse, { resident: ids.noConsent, req: request(33), plan: request(32), photo: null, extra: { no_photo_reason: 'Consentimiento no otorgado' } });
    });
    await t.test('same-day matching self reminder completed; previous day, other medication and other user remain pending', async () => {
      const occurred = new Date();
      await admin.query("insert into public.reminders(id,resident_id,kind,due_at,user_id,medication_plan_id) values ($1,$2,'bath',$3,$4,null),($5,$2,'bath',$3::timestamptz-interval '1 day',$4,null),($6,$2,'bath',$3,$7,null),($8,$2,'medication',$3,$4,$9)", [request(40), ids.resident, occurred, ids.nurse, request(41), request(42), ids.manager, request(43), ids.plan]);
      await record(nurse, { kind: 'bath', req: request(44), plan: null, units: null, photo: null, occurred });
      const reminders = await admin.query('select id,completed_at from public.reminders where id=any($1::uuid[])', [[request(40),request(41),request(42),request(43)]]);
      assert.equal(reminders.rows.filter(r => r.completed_at).length, 1);
      assert.ok(reminders.rows.find(r => r.id===request(40)).completed_at);
      await denied(nurse.query("insert into public.reminders(resident_id,kind,due_at,user_id) values ($1,'bath',now(),$2)", [ids.resident, ids.manager]));
      await admin.query("insert into public.medication_plans(id,resident_id,name,dose_amount,dose_unit,stock_unit,units_per_dose) values ($1,$2,'Segundo plan',1,'mg','tableta',1)",[request(47),ids.resident]);
      await admin.query("insert into public.reminders(id,resident_id,kind,due_at,user_id,medication_plan_id) values ($1,$2,'medication',$3,$4,$5),($6,$2,'medication',$3,$4,$7),($8,$2,'medication',$3::timestamptz-interval '1 day',$4,$5)",[request(45),ids.resident,occurred,ids.nurse,ids.plan,request(46),request(47),request(49)]);
      await record(nurse,{req:request(48),status:'omitted',units:null,photo:null,occurred,notes:'Omisión registrada para seguimiento.'});
      const medReminders=await admin.query('select id,completed_at from public.reminders where id=any($1::uuid[])',[[request(45),request(46),request(49)]]);
      assert.ok(medReminders.rows.find(r=>r.id===request(45)).completed_at);
      assert.equal(medReminders.rows.find(r=>r.id===request(46)).completed_at,null);
      assert.equal(medReminders.rows.find(r=>r.id===request(49)).completed_at,null);
    });
    await t.test('only authorized reminder owner can cancel a pending reminder, separately from clinical completion', async () => {
      await nurse.query("insert into public.reminders(id,resident_id,kind,due_at,user_id) values ($1,$2,'bath',$3,$4)",[request(110),ids.resident,recordedAt,ids.nurse]);
      await denied(manager.query('select public.cancel_reminder($1)',[request(110)]));
      await denied(family.query('select public.cancel_reminder($1)',[request(110)]));
      await denied(nurse.query('update public.reminders set cancelled_at=now() where id=$1',[request(110)]));
      await nurse.query('select public.cancel_reminder($1)',[request(110)]);
      await nurse.query('select public.cancel_reminder($1)',[request(110)]);
      await record(nurse,{kind:'bath',req:request(111),plan:null,units:null,photo:null});
      const reminder=(await admin.query('select completed_at,cancelled_at from public.reminders where id=$1',[request(110)])).rows[0];
      assert.equal(reminder.completed_at,null);
      assert.ok(reminder.cancelled_at);
      assert.equal((await admin.query("select count(*)::int n from public.audit_log where action='reminder.cancel' and target_id=$1",[request(110)])).rows[0].n,1);
      await denied(nurse.query('select public.cancel_reminder($1)',[request(40)]));
      await nurse.query("insert into public.reminders(id,resident_id,kind,due_at,user_id) values ($1,$2,'bath',now(),$3)",[request(112),ids.resident,ids.nurse]);
      await owner.query('select public.manage_profile($1,$2,$3,false)',[ids.nurse,'Nurse','nurse']);
      try { await denied(nurse.query('select public.cancel_reminder($1)',[request(112)])); }
      finally { await owner.query('select public.manage_profile($1,$2,$3,true)',[ids.nurse,'Nurse','nurse']); }
    });
    await t.test('incident validation, correction linkage and future timestamp checked server-side', async () => {
      await denied(record(nurse,{kind:'incident',req:request(60),plan:null,units:null,photo:null}));
      await denied(record(nurse,{kind:'incident',req:request(65),plan:null,units:null,photo:null,extra:{handled_by:'Responsable',actions:'Acción registrada'}}));
      await denied(record(nurse,{kind:'incident',req:request(66),plan:null,units:null,photo:null,extra:{incident_type:'unknown',handled_by:'Responsable',actions:'Acción registrada'}}));
      const incident = await record(nurse,{kind:'incident',req:request(61),plan:null,units:null,photo:null,extra:{incident_type:'fall',handled_by:'Responsable',actions:'Acción registrada'}});
      await record(nurse,{kind:'observation',req:request(62),plan:null,units:null,photo:null,extra:{corrects_event_id:incident.rows[0].id}});
      await denied(record(nurse,{kind:'observation',req:request(63),plan:null,units:null,photo:null,extra:{corrects_event_id:request(999)}}));
      await denied(record(nurse,{kind:'bath',req:request(64),plan:null,units:null,photo:null,occurred:new Date(Date.now()+3600000)}));
    });
    await t.test('admin scope, owner protection, append-only records and inventory adjustments', async () => {
      await denied(manager.query('select public.set_staff_site($1,$2,true)', [ids.nurse,ids.otherSite]));
      await denied(manager.query('select public.manage_profile($1,$2,$3,true)', [ids.manager,'Manager','owner']));
      await denied(owner.query('select public.manage_profile($1,$2,$3,false)', [ids.owner,'Owner','owner']));
      await denied(nurse.query('update public.medication_plans set stock_remaining=999 where id=$1', [ids.plan]));
      await denied(owner.query('delete from public.care_events'));
      await denied(admin.query("update public.care_events set notes='change' where resident_id=$1",[ids.resident]));
      await denied(admin.query('delete from public.profiles where id=$1',[ids.owner]));
      await denied(nurse.query('select public.register_stock($1,10,$2,$3)', [ids.plan,'Reposición',request(90)]));
      const replenished=await manager.query('select public.register_stock($1,7,$2,$3) id', [ids.plan,'Reposición',request(90)]);
      const replayed=await manager.query('select public.register_stock($1,7,$2,$3) id', [ids.plan,'Reposición',request(90)]);
      assert.equal(replenished.rows[0].id,replayed.rows[0].id);
      assert.equal(Number((await admin.query('select stock_remaining from public.medication_plans where id=$1', [ids.plan])).rows[0].stock_remaining), 7);
      assert.equal((await admin.query('select count(*)::int n from public.medication_movements where actor_id=$1 and request_id=$2',[ids.manager,request(90)])).rows[0].n,1);
      await denied(manager.query('select public.register_stock($1,-1,$2,$3)', [ids.plan,'Reposición',request(92)]));
      await denied(manager.query('select public.register_stock($1,$2,$3,$4)', [ids.plan,'NaN','Reposición',request(93)]));
      await denied(manager.query('select public.register_stock($1,7,$2,null)', [ids.plan,'Reposición']));
      await denied(manager.query('select public.register_stock($1,8,$2,$3)', [ids.plan,'Reposición',request(90)]));
      await denied(manager.query('select public.register_stock($1,7,$2,$3)', [ids.plan,'Motivo distinto',request(90)]));
      await denied(manager.query('select public.register_stock($1,7,$2,$3)', [request(47),'Reposición',request(90)]));
      assert.equal((await admin.query("select to_regprocedure('public.register_stock(uuid,numeric,text)') old_signature")).rows[0].old_signature,null);
      const created = await manager.query("insert into public.medication_plans(resident_id,name,dose_amount,dose_unit,stock_unit,units_per_dose,doses_per_day,stock_remaining) values ($1,'Nuevo',1,'mg','tableta',1,null,0) returning id",[ids.resident]);
      assert.equal(created.rowCount,1);
      await denied(manager.query("insert into public.medication_plans(resident_id,name,dose_amount,dose_unit,stock_unit,units_per_dose,stock_remaining) values ($1,'Inválido',1,'mg','tableta',1,5)",[ids.resident]));
      await denied(manager.query("insert into public.medication_plans(resident_id,name,dose_amount,dose_unit,stock_unit,units_per_dose,stock_remaining) values ($1,'Otra sede',1,'mg','tableta',1,0)",[ids.otherResident]));
      assert.equal((await nurse.query('select count(*)::int n from public.medication_plans')).rows[0].n,0);
      assert.ok((await nurse.query('select * from public.get_medication_plans($1)',[ids.resident])).rowCount>0);
    });
    await t.test('restock request racing increments stock once and authorization precedes replay', async () => {
      const concurrentManager=await as('manager');
      const results=await Promise.all([
        manager.query('select public.register_stock($1,2,$2,$3) id',[ids.plan,'Reposición concurrente',request(91)]),
        concurrentManager.query('select public.register_stock($1,2,$2,$3) id',[ids.plan,'Reposición concurrente',request(91)])
      ]);
      assert.equal(results[0].rows[0].id,results[1].rows[0].id);
      assert.equal(Number((await admin.query('select stock_remaining from public.medication_plans where id=$1',[ids.plan])).rows[0].stock_remaining),9);
      assert.equal((await admin.query('select count(*)::int n from public.medication_movements where actor_id=$1 and request_id=$2',[ids.manager,request(91)])).rows[0].n,1);
      await owner.query('select public.manage_profile($1,$2,$3,false)',[ids.manager,'Manager','manager']);
      try {
        await denied(manager.query('select public.register_stock($1,7,$2,$3)',[ids.plan,'Reposición',request(90)]));
      } finally {
        await owner.query('select public.manage_profile($1,$2,$3,true)',[ids.manager,'Manager','manager']);
      }
    });
    await t.test('medication ledger RPC reveals only linked resident and keeps historical names and units', async () => {
      const ledger=await family.query('select * from public.get_medication_movements($1)',[ids.resident]);
      assert.ok(ledger.rowCount>=4);
      assert.ok(ledger.rows.some(m=>Number(m.units_delta)>0&&m.event_id===null));
      assert.ok(ledger.rows.some(m=>Number(m.units_delta)<0&&m.event_id!==null));
      assert.ok(ledger.rows.every(m=>m.medication_name==='Tratamiento de prueba'&&m.stock_unit==='tableta'));
      assert.ok(ledger.rows.every(m=>['Nurse','Manager'].includes(m.actor_name)));
      assert.equal((await patient.query('select * from public.get_medication_movements($1)',[ids.resident])).rowCount,ledger.rowCount);
      assert.equal((await otherFamily.query('select * from public.get_medication_movements($1)',[ids.otherResident])).rowCount,0);
      await denied(otherFamily.query('select * from public.get_medication_movements($1)',[ids.resident]));
      await denied(patient.query('select * from public.get_medication_movements($1)',[ids.otherResident]));
      await denied(family.query('select * from public.medication_movements'));
      await admin.query("update public.medication_plans set name='Nombre nuevo',stock_unit='unidad nueva' where id=$1",[ids.plan]);
      try {
        const historical=await patient.query('select * from public.get_medication_movements($1)',[ids.resident]);
        assert.ok(historical.rows.every(m=>m.medication_name==='Tratamiento de prueba'&&m.stock_unit==='tableta'));
      } finally { await admin.query("update public.medication_plans set name='Tratamiento de prueba',stock_unit='tableta' where id=$1",[ids.plan]); }
      assert.ok((await admin.query("select count(*)::int n from public.audit_log where actor_id=$1 and action='movements.read'",[ids.family])).rows[0].n>0);
    });
    await t.test('converting a family profile to patient cannot preserve multiple resident links', async () => {
      await owner.query('select public.set_resident_access($1,$2,true)',[ids.noConsent,ids.otherFamily]);
      try {
        await denied(owner.query('select public.manage_profile($1,$2,$3,true)',[ids.otherFamily,'Other family','patient']));
        assert.equal((await admin.query('select role from public.profiles where id=$1',[ids.otherFamily])).rows[0].role,'family');
        assert.equal((await admin.query('select count(*)::int n from public.resident_access where user_id=$1',[ids.otherFamily])).rows[0].n,2);
      } finally {
        await owner.query('select public.set_resident_access($1,$2,false)',[ids.noConsent,ids.otherFamily]);
      }
      await owner.query('select public.manage_profile($1,$2,$3,true)',[ids.otherFamily,'Other family','patient']);
      assert.equal((await admin.query('select role from public.profiles where id=$1',[ids.otherFamily])).rows[0].role,'patient');
      await denied(owner.query('select public.set_resident_access($1,$2,true)',[ids.noConsent,ids.otherFamily]));
      await owner.query('select public.manage_profile($1,$2,$3,true)',[ids.otherFamily,'Other family','family']);
    });
    await t.test('existing staff JWT loses clinical access immediately when profile is inactive', async () => {
      await nurse.query('select * from public.get_resident_timeline($1)',[ids.resident]);
      await owner.query('select public.manage_profile($1,$2,$3,false)',[ids.nurse,'Nurse','nurse']);
      try {
        assert.equal((await nurse.query('select count(*)::int n from public.residents')).rows[0].n,0);
        await denied(nurse.query('select public.get_resident_timeline($1)',[ids.resident]));
        await denied(nurse.query('select public.get_medication_plans($1)',[ids.resident]));
        await denied(record(nurse,{kind:'bath',req:request(80),plan:null,units:null,photo:null}));
      } finally {
        await owner.query('select public.manage_profile($1,$2,$3,true)',[ids.nurse,'Nurse','nurse']);
      }
    });
    await t.test('inactive resident denies nurse, patient and family while owner retains archive access', async () => {
      await owner.query('update public.residents set active=false where id=$1',[ids.resident]);
      try {
        await denied(nurse.query('select public.get_resident_timeline($1)',[ids.resident]));
        await denied(patient.query('select public.get_resident_timeline($1)',[ids.resident]));
        await denied(family.query('select public.get_medication_plans($1)',[ids.resident]));
        await denied(record(nurse,{kind:'bath',req:request(81),plan:null,units:null,photo:null}));
        await owner.query('select * from public.get_resident_timeline($1)',[ids.resident]);
      } finally {
        await owner.query('update public.residents set active=true where id=$1',[ids.resident]);
      }
    });
    await t.test('draft deletion waiting on an uncommitted clinical attachment cannot remove evidence', async () => {
      const photo=`${ids.resident}/${request(82)}.jpg`;
      const deletingNurse=await as('nurse');
      const pid=(await deletingNurse.query('select pg_backend_pid() pid')).rows[0].pid;
      await nurse.query('insert into storage.objects(bucket_id,name,owner_id) values ($1,$2,$3)',['care-photos',photo,ids.nurse]);
      await nurse.query('begin');
      let deletion;
      try {
        await record(nurse,{kind:'bath',req:request(83),plan:null,units:null,photo});
        deletion=deletingNurse.query("delete from storage.objects where bucket_id='care-photos' and name=$1 returning name",[photo]).then(result=>({result}),error=>({error}));
        let blocked=false;
        for(let attempt=0;attempt<100;attempt++) {
          const activity=await admin.query('select wait_event from pg_stat_activity where pid=$1',[pid]);
          if(activity.rows[0]?.wait_event==='advisory'){blocked=true;break;}
          await new Promise(resolve=>setTimeout(resolve,20));
        }
        assert.ok(blocked,'DELETE must wait on the clinical attachment lock before commit');
        await nurse.query('commit');
        const outcome=await deletion;
        assert.equal(outcome.error?.code,'42501');
        assert.equal((await admin.query("select count(*)::int n from storage.objects where bucket_id='care-photos' and name=$1",[photo])).rows[0].n,1);
      } catch(error) {
        await nurse.query('rollback');
        if(deletion) await deletion;
        throw error;
      }
    });
    await t.test('private storage isolates residents, ownership, consent and disallows overwrite', async () => {
      const rows = await family.query("select name from storage.objects where bucket_id='care-photos'");
      assert.deepEqual(rows.rows.map(r => r.name).sort(), [`${ids.resident}/${request(100)}.jpg`,`${ids.resident}/${request(82)}.jpg`].sort());
      await denied(family.query('insert into storage.objects(bucket_id,name,owner_id) values ($1,$2,$3)', ['care-photos', `${ids.resident}/${request(50)}.jpg`, ids.family]));
      await denied(nurse.query('insert into storage.objects(bucket_id,name,owner_id) values ($1,$2,$3)', ['care-photos', `${ids.noConsent}/${request(51)}.jpg`, ids.nurse]));
      await denied(nurse.query('insert into storage.objects(bucket_id,name,owner_id) values ($1,$2,$3)', ['care-photos', `${ids.resident}/${request(52)}.jpg`, ids.manager]));
      const changed = await nurse.query("update storage.objects set name=$1 where name=$2 returning name", [`${ids.resident}/${request(53)}.jpg`,`${ids.resident}/${request(100)}.jpg`]);
      assert.equal(changed.rowCount,0);
      const draft = `${ids.resident}/${request(54)}.jpg`;
      await nurse.query('insert into storage.objects(bucket_id,name,owner_id) values ($1,$2,$3)',['care-photos',draft,ids.nurse]);
      assert.equal((await nurse.query("delete from storage.objects where bucket_id='care-photos' and name=$1 returning name",[draft])).rowCount,1);
      assert.equal((await nurse.query("delete from storage.objects where bucket_id='care-photos' and name=$1 returning name",[`${ids.resident}/${request(100)}.jpg`])).rowCount,0);
      await denied(admin.query("delete from storage.objects where bucket_id='care-photos' and name=$1",[`${ids.resident}/${request(100)}.jpg`]));
      await owner.query('update public.residents set photo_consent=false where id=$1',[ids.resident]);
      assert.equal((await family.query("select count(*)::int n from storage.objects where bucket_id='care-photos'")).rows[0].n,0);
    });
    await t.test('concurrent owner removals preserve one active owner', async () => {
      await owner.query('select public.manage_profile($1,$2,$3,true)',[ids.manager,'Second owner','owner']);
      const secondOwner=await as('manager');
      const outcomes=await Promise.allSettled([
        owner.query('select public.manage_profile($1,$2,$3,false)',[ids.owner,'Owner','owner']),
        secondOwner.query('select public.manage_profile($1,$2,$3,false)',[ids.manager,'Second owner','owner'])
      ]);
      assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
      assert.equal(outcomes.filter(r=>r.status==='rejected'&&r.reason.code==='42501').length,1);
      assert.equal((await admin.query("select count(*)::int n from public.profiles where role='owner' and active")).rows[0].n,1);
    });
  } finally {
    await Promise.all(clients.map(client => client.end()));
    await admin.end();
  }
});

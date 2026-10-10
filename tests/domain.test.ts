import test from 'node:test';
import assert from 'node:assert/strict';
const domain = await import('../src/domain.ts').catch(() => null);
test('a scheduled low-stock notice estimates the configured threshold crossing',()=>{
 assert.ok(domain);
 const forecast=domain.medicationForecast({stock_remaining:8,units_per_dose:1,doses_per_day:2,low_stock_threshold:7},new Date('2026-10-09T12:00:00Z'));
 assert.equal(forecast.lowStockAt,'2026-10-10T00:00:00.000Z');
 assert.equal(domain.medicationForecast({stock_remaining:8,units_per_dose:1,doses_per_day:null,low_stock_threshold:7}).lowStockAt,null);
});

test('seven tablets at two per day estimates 3.5 days, not seven days', () => {
  assert.ok(domain, 'care domain must exist');
  const result = domain.medicationForecast({ stock_remaining:7, units_per_dose:1, doses_per_day:2, low_stock_threshold:7 }, new Date('2026-10-09T12:00:00Z'));
  assert.equal(result.daysRemaining,3.5);
  assert.equal(result.runsOutAt,'2026-10-13T00:00:00.000Z');
  assert.equal(result.lowStock,true);
});
test('as-needed medication never invents a depletion date', () => {
  assert.ok(domain);
  assert.equal(domain.medicationForecast({ stock_remaining:7, units_per_dose:1, doses_per_day:null, low_stock_threshold:7 }).runsOutAt,null);
});
test('dose strength in milligrams never counts as inventory tablets', () => {
  assert.ok(domain);
  assert.equal(domain.medicationForecast({ stock_remaining:7, units_per_dose:0.5, doses_per_day:2, low_stock_threshold:7 }).daysRemaining,7);
});
test('rejects invalid stock and scheduled dose', () => {
  assert.ok(domain);
  assert.throws(()=>domain.medicationForecast({stock_remaining:-1,units_per_dose:1,doses_per_day:2,low_stock_threshold:7}));
  assert.throws(()=>domain.medicationForecast({stock_remaining:7,units_per_dose:0,doses_per_day:2,low_stock_threshold:7}));
});
test('incident requires person who attended and action, including vomiting', () => {
  assert.ok(domain);
  assert.ok(domain.validateCareDraft({kind:'incident',notes:'',details:{incident_type:'vomiting'},occurred_at:new Date().toISOString()},false).length>0);
  assert.deepEqual(domain.validateCareDraft({kind:'incident',notes:'Vomito una vez',details:{incident_type:'vomiting',handled_by:'Enfermera responsable',actions:'Atencion y aviso a supervision'},occurred_at:new Date().toISOString()},false),[]);
});
test('medication administration requires prescribed plan and photo or no-consent reason', () => {
  assert.ok(domain);
  assert.ok(domain.validateCareDraft({kind:'medication',notes:'',details:{status:'administered'},occurred_at:new Date().toISOString()},true).length>0);
});
test('pending reminders exclude completed or future reminders', () => {
  assert.ok(domain);
  const now=new Date('2026-10-09T12:00:00Z');
  assert.deepEqual(domain.pendingReminders([{id:'due',due_at:'2026-10-09T11:00:00Z',completed_at:null},{id:'future',due_at:'2026-10-09T13:00:00Z',completed_at:null},{id:'done',due_at:'2026-10-09T11:00:00Z',completed_at:'2026-10-09T11:30:00Z'}],now).map(x=>x.id),['due']);
});
test('meal and activity records require complete, bounded details',()=>{
 assert.ok(domain);
 const base={occurred_at:new Date().toISOString(),notes:'',details:{},photo_path:null};
 assert.ok(domain.validateCareDraft({...base,kind:'meal'},false).length);
 assert.deepEqual(domain.validateCareDraft({...base,kind:'meal',details:{meal:'Cena',intake:'No comió'}},false),[]);
 assert.ok(domain.validateCareDraft({...base,kind:'activity',details:{activity:'Prueba',minutes:'601'}},false).length);
 assert.deepEqual(domain.validateCareDraft({...base,kind:'activity',details:{activity:'Prueba',minutes:'15'}},false),[]);
});

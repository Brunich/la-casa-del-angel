import test from 'node:test';
import assert from 'node:assert/strict';
import {dailyCareGaps} from '../src/lib/daily-care.ts';
test('daily meal checks separate absent records, missing photos and consent exceptions',()=>{
 const resident={id:'one',name:'Uno',site_id:'site',photo_consent:true,plans:[],events:[{kind:'meal',meal:'Desayuno',has_photo:true},{kind:'meal',meal:'Comida',has_photo:false,no_photo_reason:true}]};
 assert.deepEqual(dailyCareGaps(resident).filter(gap=>gap.kind==='meal').map(gap=>gap.label),['Cena: cuidado sin registrar']);
 assert.ok(dailyCareGaps({...resident,events:[{kind:'meal',meal:'Desayuno',has_photo:false}]}).some(gap=>gap.label==='Desayuno: falta fotografía'));
 assert.ok(!dailyCareGaps({...resident,photo_consent:false}).some(gap=>gap.label.includes('fotografía')));
});
test('medication photos only expected for actual administered events, not refused or PRN estimates',()=>{
 const resident={id:'one',name:'Uno',site_id:'site',photo_consent:true,plans:[{id:'p',name:'Pauta',doses_per_day:2},{id:'prn',name:'Según necesidad',doses_per_day:null}],events:[{kind:'medication',plan_id:'p',status:'refused',has_photo:false},{kind:'medication',plan_id:'p',status:'administered',has_photo:false}]};
 const gaps=dailyCareGaps(resident);
 assert.equal(gaps.filter(gap=>gap.kind==='medication').length,1);
 assert.match(gaps.find(gap=>gap.kind==='medication')!.label,/falta fotografía/);
 assert.ok(!gaps.some(gap=>gap.label.includes('Según necesidad')));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {selectCareHistory} from '../src/lib/care-history.ts';

const events=[{id:'incident',kind:'incident',photo_path:'private/incident.jpg'},{id:'bath',kind:'bath',photo_path:'private/bath.jpg'},{id:'meal',kind:'meal',photo_path:null}];
test('care and incident views retain distinct records, while photos include both',()=>{
 assert.deepEqual(selectCareHistory(events,'care').map(event=>event.id),['bath','meal']);
 assert.deepEqual(selectCareHistory(events,'incidents').map(event=>event.id),['incident']);
 assert.deepEqual(selectCareHistory(events,'photos').map(event=>event.id),['incident','bath']);
 assert.deepEqual(selectCareHistory(events,'care','meal').map(event=>event.id),['meal']);
 assert.deepEqual(events.map(event=>event.id),['incident','bath','meal']);
});

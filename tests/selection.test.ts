import test from 'node:test';
import assert from 'node:assert/strict';
const lib=await import('../src/lib/selection.ts').catch(()=>null);
test('a saved care from A cannot replace the timeline for B',()=>{
 assert.ok(lib,'selection gate must exist');const gate=new lib.SelectionGate();gate.select('A');const ticket=gate.capture();gate.select('B');assert.equal(gate.isCurrent(ticket),false);assert.equal(gate.current,'B');
});
test('switching back to A cannot resurrect a callback from its previous form',()=>{
 assert.ok(lib);const gate=new lib.SelectionGate();gate.select('A');const ticket=gate.capture();gate.select('B');gate.select('A');assert.equal(gate.isCurrent(ticket),false);assert.equal(gate.isCurrent(gate.capture()),true);
});
test('leaving the portal invalidates pending clinical callbacks',()=>{
 assert.ok(lib);const gate=new lib.SelectionGate();gate.select('A');const ticket=gate.capture();gate.invalidate();assert.equal(gate.isCurrent(ticket),false);
});

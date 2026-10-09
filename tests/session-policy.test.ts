import test from 'node:test';
import assert from 'node:assert/strict';
const lib=await import('../src/lib/session-policy.ts').catch(()=>null);
test('private session expires after fifteen minutes without interaction',()=>{assert.ok(lib);assert.equal(lib.sessionExpired(1000,901000),true);assert.equal(lib.sessionExpired(1000,900999),false)});
test('a stale clock value fails closed',()=>{assert.ok(lib);assert.equal(lib.sessionExpired(Number.NaN,1000),true);assert.equal(lib.sessionExpired(1000,999),true)});

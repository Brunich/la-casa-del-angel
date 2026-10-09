import test from 'node:test';
import assert from 'node:assert/strict';
const lib=await import('../src/lib/initial-mfa.ts').catch(()=>null);
test('staff must verify a factor once, then normal logins do not request another challenge',()=>{assert.ok(lib);for(const role of ['owner','manager','nurse']){assert.equal(lib.needsInitialMfa(role,[]),true);assert.equal(lib.needsInitialMfa(role,[{status:'unverified'}]),true);assert.equal(lib.needsInitialMfa(role,[{status:'verified'}]),false)}});
test('family and resident access retain their existing policy',()=>{assert.ok(lib);assert.equal(lib.needsInitialMfa('family',[]),false);assert.equal(lib.needsInitialMfa('patient',[]),false)});

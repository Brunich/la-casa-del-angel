import test from 'node:test';
import assert from 'node:assert/strict';
const lib = await import('../src/lib/admin-input.ts').catch(() => null);
const userId = '550e8400-e29b-41d4-a716-446655440000';
const otherId = '650e8400-e29b-41d4-a716-446655440001';
const owner = {id:userId,role:'owner' as const};
const profileInput = {userId:otherId,fullName:'  María Pérez  ',role:'family',active:true,verified:true};

test('UUID input trims whitespace and normalizes uppercase', () => {
  assert.ok(lib, 'admin input validation must exist');
  assert.equal(lib.parseUuid('  '+userId.toUpperCase()+'  '), userId);
});
test('UUID input rejects empty, malformed, wrapped and non-text values', () => {
  assert.ok(lib);
  for (const value of ['', '  ', userId.replaceAll('-', ''), '{'+userId+'}', userId+'x', 'gg0e8400-e29b-41d4-a716-446655440000', null, 42, {}, userId.slice(0,-1)+'\n0']) {
    assert.throws(() => lib.parseUuid(value));
  }
});
test('profile validation trims names and preserves explicit inactive state', () => {
  assert.ok(lib);
  assert.deepEqual(lib.parseProfileInput({...profileInput, active:false}, owner), {...profileInput, fullName:'María Pérez', active:false});
});
test('profile validation requires a real role and boolean state', () => {
  assert.ok(lib);
  for (const role of ['admin', 'OWNER', '', null, '__proto__']) assert.throws(() => lib.parseProfileInput({...profileInput, role}, owner));
  for (const active of ['false', null, 1]) assert.throws(() => lib.parseProfileInput({...profileInput, active}, owner));
});
test('names require one to 160 trimmed characters', () => {
  assert.ok(lib);
  for (const fullName of ['', ' \n ', 'a'.repeat(161), null]) assert.throws(() => lib.parseProfileInput({...profileInput, fullName}, owner));
  assert.equal(lib.parseProfileInput({...profileInput,fullName:' '+ 'a'.repeat(160)+' '},owner).fullName.length,160);
  assert.equal(lib.parseSiteName('  Sede Centro  '),'Sede Centro');
  assert.throws(() => lib.parseSiteName('a'.repeat(161)));
});
test('profile changes require owner and cannot deactivate or demote their own account', () => {
  assert.ok(lib);
  assert.throws(() => lib.parseProfileInput(profileInput, {id:userId,role:'manager'}));
  assert.throws(() => lib.parseProfileInput({...profileInput,userId,role:'owner',active:false},owner));
  assert.throws(() => lib.parseProfileInput({...profileInput,userId,role:'nurse'},owner));
  assert.equal(lib.parseProfileInput({...profileInput,userId,role:'owner'},owner).active,true);
});
test('account and assignment changes require explicit identity verification', () => {
  assert.ok(lib);
  for(const verified of [false, null, 'true']) {
    assert.throws(() => lib.parseProfileInput({...profileInput,verified},owner));
    assert.throws(() => lib.parseAssignmentInput({userId,targetId:otherId,assigned:true,verified}));
  }
});
test('assignment validation supports grant and revoke with normalized IDs', () => {
  assert.ok(lib);
  for(const assigned of [true,false]) assert.deepEqual(lib.parseAssignmentInput({userId:' '+userId+' ',targetId:otherId.toUpperCase(),assigned,verified:true}),{userId,targetId:otherId,assigned,verified:true});
});
test('assignment validation rejects invalid target IDs and implicit boolean coercion', () => {
  assert.ok(lib);
  assert.throws(() => lib.parseAssignmentInput({userId,targetId:'',assigned:true,verified:true}));
  assert.throws(() => lib.parseAssignmentInput({userId:'',targetId:otherId,assigned:true,verified:true}));
  for(const assigned of ['false',null,1]) assert.throws(() => lib.parseAssignmentInput({userId,targetId:otherId,assigned,verified:true}));
});

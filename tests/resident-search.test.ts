import test from 'node:test';
import assert from 'node:assert/strict';
const lib = await import('../src/lib/resident-search.ts').catch(() => null);
const residents = Object.freeze([
  Object.freeze({id:'a',full_name:'María  José Núñez',room:'204 A'}),
  Object.freeze({id:'b',full_name:'Ángel de la Peña',room:'105'}),
  Object.freeze({id:'c',full_name:'Luisa López',room:''}),
]);

test('name search ignores accents, case and repeated whitespace', () => {
  assert.ok(lib,'resident search must exist');
  assert.deepEqual(lib.filterResidents(residents,'  MARIA   JOSE  '),[residents[0]]);
  assert.deepEqual(lib.filterResidents(residents,'angel pena'),[residents[1]]);
});
test('name search accepts decomposed Unicode accents', () => {
  assert.ok(lib);
  assert.deepEqual(lib.filterResidents(residents,'Nu\u0301n\u0303ez'),[residents[0]]);
});
test('search finds rooms and combines room with name tokens', () => {
  assert.ok(lib);
  assert.deepEqual(lib.filterResidents(residents,' 204   a '),[residents[0]]);
  assert.deepEqual(lib.filterResidents(residents,'105 angel'),[residents[1]]);
});
test('blank search returns all authorized input residents in their original order', () => {
  assert.ok(lib);
  assert.deepEqual(lib.filterResidents(residents,' \n\t '),residents);
});
test('all search tokens must match the same resident', () => {
  assert.ok(lib);
  assert.deepEqual(lib.filterResidents(residents,'maria 105'),[]);
  assert.deepEqual(lib.filterResidents(residents,'nadie'),[]);
  assert.deepEqual(lib.filterResidents([],''),[]);
});
test('filter preserves input residents and never synthesizes records', () => {
  assert.ok(lib);
  const result=lib.filterResidents(residents,'lopez');
  assert.equal(result.length,1);
  assert.equal(result[0],residents[2]);
  assert.equal(residents.length,3);
  assert.equal(residents[0].full_name,'María  José Núñez');
});

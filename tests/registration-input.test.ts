import test from 'node:test';
import assert from 'node:assert/strict';
const lib=await import('../src/lib/registration-input.ts').catch(()=>null);
const password='Una frase privada suficientemente larga';
const valid={email:' REGISTRO@example.invalid ',fullName:' Solicitante de prueba ',password,confirmation:password,siteId:null};
test('self registration can request no site without creating a role or clinical assignment',()=>{assert.ok(lib,'registration validation must exist');const result=lib.parseRegistrationInput({...valid,role:'owner'});assert.deepEqual(result,{email:'registro@example.invalid',fullName:'Solicitante de prueba',password,siteId:null});});
test('chosen registration site is a validated request UUID',()=>{assert.ok(lib);assert.equal(lib.parseRegistrationInput({...valid,siteId:' 550E8400-E29B-41D4-A716-446655440000 '}).siteId,'550e8400-e29b-41d4-a716-446655440000');assert.throws(()=>lib.parseRegistrationInput({...valid,siteId:'not-a-site'}));});
test('registration rejects invalid identity and mismatching or short passwords',()=>{assert.ok(lib);for(const input of [{...valid,email:'invalid'},{...valid,fullName:' '},{...valid,password:'short',confirmation:'short'},{...valid,confirmation:'a different private password'}])assert.throws(()=>lib.parseRegistrationInput(input));});

import test from 'node:test';
import assert from 'node:assert/strict';
const lib=await import('../src/lib/account-link.ts').catch(()=>null);
const token='a'.repeat(64);
test('accepts invitation, recovery and signup/email verification hashes on the account route',()=>{assert.ok(lib);assert.deepEqual(lib.parseAccountLink('#token_hash='+token+'&type=invite'),{tokenHash:token,type:'invite'});assert.equal(lib.parseAccountLink('#token_hash='+token+'&type=recovery').type,'recovery');assert.deepEqual(lib.parseAccountLink('#token_hash='+token+'&type=signup'),{tokenHash:token,type:'signup'});assert.deepEqual(lib.parseAccountLink('#token_hash='+token+'&type=email'),{tokenHash:token,type:'email'});});
test('rejects absent, duplicate, malformed or unrelated account links',()=>{assert.ok(lib);for(const fragment of ['', '#token_hash=&type=invite','#token_hash='+token+'&type=email_change','#token_hash='+token+'&type=recovery&type=invite','#token_hash='+token+'&token_hash=other&type=invite','#token_hash=%0Aunsafe&type=invite'])assert.throws(()=>lib.parseAccountLink(fragment));});
test('cannot turn a supplied next destination into a redirect',()=>{assert.ok(lib);const parsed=lib.parseAccountLink('#token_hash='+token+'&type=invite&next=https://attacker.invalid');assert.equal(Object.hasOwn(parsed,'next'),false);});
test('new password requires a long matching value without silently trimming it',()=>{assert.ok(lib);assert.deepEqual(lib.passwordIssues('Una clave larga! 123','Una clave larga! 123'),[]);assert.ok(lib.passwordIssues('corta','corta').length);assert.ok(lib.passwordIssues('Una clave larga! 123','otra clave larga 456').length);});

test('native recovery uses the authorized web account route, never the local WebView origin',()=>{assert.ok(lib);assert.equal(lib.accountRecoveryRedirect('https://localhost',true),'https://la-casa-del-angel.vercel.app/cuenta');assert.equal(lib.accountRecoveryRedirect('capacitor://localhost',true),'https://la-casa-del-angel.vercel.app/cuenta');assert.equal(lib.accountRecoveryRedirect('https://la-casa-del-angel.vercel.app',false),'https://la-casa-del-angel.vercel.app/cuenta');});
test('passwords respect the actual 72-byte bcrypt limit including accents',()=>{
 assert.deepEqual(lib.passwordIssues('a'.repeat(72),'a'.repeat(72)),[]);
 assert.ok(lib.passwordIssues('a'.repeat(73),'a'.repeat(73)).length);
 assert.deepEqual(lib.passwordIssues('ñ'.repeat(36),'ñ'.repeat(36)),[]);
 assert.ok(lib.passwordIssues('ñ'.repeat(37),'ñ'.repeat(37)).length);
});

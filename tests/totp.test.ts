import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

// Evaluate the actual pure helper without running the server or replacing Auth.
const source=ts.createSourceFile('demo-session.ts',readFileSync(new URL('../supabase/functions/demo-session/index.ts',import.meta.url),'utf8'),ts.ScriptTarget.ESNext,true);
const helper=source.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='generateTotp');
const failure=source.statements.find(node=>ts.isClassDeclaration(node)&&node.name?.text==='DemoFailure');
assert.ok(helper&&failure,'The real RFC 6238 helper must exist');
const compiled=ts.transpileModule(`${failure.getText(source)}\nexport ${helper.getText(source)}`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {generateTotp}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
const publishedTestSecret='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; // RFC 6238 Appendix B, public test key.
test('actual demo helper matches all RFC 6238 SHA-1 vectors at six digits',async()=>{
 for(const [seconds,expected] of [[59,'287082'],[1111111109,'081804'],[1111111111,'050471'],[1234567890,'005924'],[2000000000,'279037'],[20000000000,'353130']])assert.equal(await generateTotp(publishedTestSecret,seconds),expected);
});
test('actual helper rejects invalid or inadequate secrets before issuing a code',async()=>{
 await assert.rejects(generateTotp('not-valid!',59));
 await assert.rejects(generateTotp('AAAA',59));
 assert.equal(await generateTotp(publishedTestSecret.toLowerCase()+'=',59),'287082');
});

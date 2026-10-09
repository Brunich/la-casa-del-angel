import test from 'node:test';
import assert from 'node:assert/strict';
const lib=await import('../src/lib/session-storage.ts').catch(()=>null);
test('navigation retains authentication without extending inactivity',()=>{
 assert.ok(lib); const entries=new Map<string,string>(); const storage={getItem:(k:string)=>entries.get(k)??null,setItem:(k:string,v:string)=>{entries.set(k,v)},removeItem:(k:string)=>{entries.delete(k)}};
 let now=1000;const auth=lib.createSessionStorage(storage,()=>now);
 auth.setItem('auth','token'); now=5000;assert.equal(auth.getItem('auth'),'token');
 auth.setItem('auth','refreshed');now=901000;assert.equal(auth.getItem('auth'),null);
});
test('explicit logout clears authentication and activity',()=>{
 assert.ok(lib);const entries=new Map<string,string>();const storage={getItem:(k:string)=>entries.get(k)??null,setItem:(k:string,v:string)=>{entries.set(k,v)},removeItem:(k:string)=>{entries.delete(k)}};
 const auth=lib.createSessionStorage(storage,()=>1000);auth.setItem('auth','token');auth.removeItem('auth');assert.equal(entries.size,0);
});

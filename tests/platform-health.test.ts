import test from 'node:test';
import assert from 'node:assert/strict';
import {GET,HEAD} from '../api/health.js';

test('unsupported methods cannot run platform checks',async()=>{
 const response=await GET(new Request('https://example.invalid/api/health',{method:'POST'}));
 assert.equal(response.status,405);assert.equal(response.headers.get('allow'),'GET, HEAD');
});
test('missing configuration fails closed without revealing provider details',async()=>{
 const saved=process.env.VITE_SUPABASE_URL;delete process.env.VITE_SUPABASE_URL;
 try{
  const response=await GET(new Request('https://example.invalid/api/health'));
  assert.equal(response.status,503);assert.deepEqual(await response.json(),{status:'unavailable'});
  assert.equal(response.headers.get('cache-control'),'no-store');
  const head=await HEAD(new Request('https://example.invalid/api/health',{method:'HEAD'}));
  assert.equal(head.status,503);assert.equal(await head.text(),'');
 }finally{if(saved===undefined)delete process.env.VITE_SUPABASE_URL;else process.env.VITE_SUPABASE_URL=saved;}
});

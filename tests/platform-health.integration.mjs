import assert from 'node:assert/strict';
import {GET,HEAD} from '../api/health.js';

// Actual Auth and PostgREST requests, using only the configured public key.
const key=process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
assert.ok(key,'Load the authorized evaluation configuration with --env-file.');
assert.equal(new URL(process.env.VITE_SUPABASE_URL).hostname,'isqismxhaudpogkkwass.supabase.co');
const get=await GET(new Request('https://example.invalid/api/health'));
assert.equal(get.status,200);assert.deepEqual(await get.json(),{status:'ok'});
const head=await HEAD(new Request('https://example.invalid/api/health',{method:'HEAD'}));
assert.equal(head.status,200);assert.equal(await head.text(),'');
try{
 process.env.VITE_SUPABASE_PUBLISHABLE_KEY=key.slice(0,-1)+(key.endsWith('A')?'B':'A');
 const rejected=await GET(new Request('https://example.invalid/api/health'));
 assert.equal(rejected.status,503);assert.deepEqual(await rejected.json(),{status:'unavailable'});
}finally{process.env.VITE_SUPABASE_PUBLISHABLE_KEY=key;}
console.log(JSON.stringify({realAuth:true,realDatabase:true,get:200,head:200,invalidPublicKey:503,clinicalDataReturned:false}));

// Permanent, read-only availability check. No user session, service key, clinical
// data or provider diagnostic is returned. A successful HEAD performs the same
// actual checks as GET, then returns no body.
function publicConfiguration(){
 try{
  const url=new URL(process.env.VITE_SUPABASE_URL??'');
  const key=process.env.VITE_SUPABASE_PUBLISHABLE_KEY??'';
  if(url.protocol!=='https:'||! /^[a-z0-9]{20}\.supabase\.co$/.test(url.hostname)||
   url.username||url.password||url.port||url.pathname!=='/'||url.search||url.hash||key.length>4096||/\s/.test(key))return null;
  if(!key.startsWith('sb_publishable_')){
   const parts=key.split('.');
   if(parts.length!==3)return null;
   // Structural check only; Supabase validates the signature on the requests.
   const payload=JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8'));
   if(payload.role!=='anon')return null;
  }
  return {origin:url.origin,key};
 }catch{return null;}
}

async function probe(configuration){
 const signal=AbortSignal.timeout(5000);
 const headers={apikey:configuration.key};
 try{
  const responses=await Promise.all([
   fetch(configuration.origin+'/auth/v1/health',{headers,signal,redirect:'error',cache:'no-store'}),
   fetch(configuration.origin+'/rest/v1/rpc/get_registration_sites',{
    method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{}',signal,redirect:'error',cache:'no-store',
   }),
  ]);
  // The public catalog proves a DB roundtrip; its names/IDs never leave here.
  const healthy=responses.every(response=>response.status===200);
  await Promise.all(responses.map(response=>response.body?.cancel()));
  return healthy;
 }catch{return false;}
}

async function respond(request){
 const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex, noarchive'};
 if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{...headers,Allow:'GET, HEAD'}});
 const configuration=publicConfiguration();
 const healthy=configuration?await probe(configuration):false;
 return new Response(request.method==='HEAD'?null:JSON.stringify({status:healthy?'ok':'unavailable'}),{status:healthy?200:503,headers});
}
export const GET=respond;
export const HEAD=respond;

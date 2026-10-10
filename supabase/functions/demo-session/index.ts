import {createClient,type SupabaseClient,type User} from 'npm:@supabase/supabase-js@2.117.3';

const operatorId='54e5f326-3d49-468a-b50f-2e70c68b5091';
const allowedOrigins=['https://la-casa-del-angel.vercel.app','https://localhost','capacitor://localhost'];
const demoEmails={manager:'demo-manager@casa-angel.example.invalid',nurse:'demo-nurse@casa-angel.example.invalid'} as const;
type StaffDemoRole=keyof typeof demoEmails;
type DemoRole=StaffDemoRole|'family-one'|'family-two';
const demoRoles:DemoRole[]=['manager','nurse','family-one','family-two'];
class DemoFailure extends Error{constructor(readonly code:string){super(code);}}

async function readBody(req:Request):Promise<Record<string,unknown>>{
 const reader=req.body?.getReader();if(!reader)throw new DemoFailure('INVALID_BODY');
 const chunks:Uint8Array[]=[];let bytes=0;
 try{for(;;){const{value,done}=await reader.read();if(done)break;bytes+=value.byteLength;
  if(bytes>2048){await reader.cancel();throw new DemoFailure('INVALID_BODY');}chunks.push(value);
 }}finally{reader.releaseLock();}
 const joined=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){joined.set(chunk,offset);offset+=chunk.length;}
 let body:unknown;
 try{body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(joined));}
 catch{throw new DemoFailure('INVALID_BODY');}
 if(!body||typeof body!=='object'||Array.isArray(body))throw new DemoFailure('INVALID_BODY');
 return body as Record<string,unknown>;
}

// RFC 6238, SHA-1 / six digits / 30 seconds. The enrolled secret is used only
// inside this request to complete a genuine Auth challenge, then discarded.
async function generateTotp(secret:string,seconds=Math.floor(Date.now()/1000)):Promise<string>{
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits=0,value=0;const decoded:number[]=[];
 for(const character of secret.toUpperCase().replace(/=+$/,'')){
  const index=alphabet.indexOf(character);if(index<0)throw new DemoFailure('DEMO_FACTOR_ERROR');
  value=(value<<5)|index;bits+=5;
  if(bits>=8){bits-=8;decoded.push((value>>>bits)&255);value&=(1<<bits)-1;}
 }
 if(decoded.length<10)throw new DemoFailure('DEMO_FACTOR_ERROR');
 const counter=new Uint8Array(8);new DataView(counter.buffer).setBigUint64(0,BigInt(Math.floor(seconds/30)),false);
 const key=await crypto.subtle.importKey('raw',new Uint8Array(decoded),{name:'HMAC',hash:'SHA-1'},false,['sign']);
 const hash=new Uint8Array(await crypto.subtle.sign('HMAC',key,counter));const start=hash[hash.length-1]&15;
 const binary=((hash[start]&127)<<24)|((hash[start+1]&255)<<16)|((hash[start+2]&255)<<8)|(hash[start+3]&255);
 return (binary%1_000_000).toString().padStart(6,'0');
}

function belongsToDemo(user:User,role:DemoRole):boolean{
 // Family identities come only from the server's fixed private allowlist,
 // checked before and after minting. They retain their own passwords/factors.
 if(role==='family-one'||role==='family-two')return user.email_confirmed_at!=null;
 return user.email?.toLowerCase()===demoEmails[role]&&user.email_confirmed_at!=null&&
  user.app_metadata.care_demo_owner===operatorId&&user.app_metadata.care_demo_role===role;
}

async function mintDemoSession(admin:SupabaseClient,url:string,anon:string,user:User,role:DemoRole){
 if(!belongsToDemo(user,role))throw new DemoFailure('DEMO_ACCOUNT_CONFLICT');
 if(!user.email)throw new DemoFailure('DEMO_ACCOUNT_CONFLICT');
 const{data:link,error:linkError}=await admin.auth.admin.generateLink({type:'magiclink',email:user.email});
 if(linkError||link.user?.id!==user.id||!link.properties?.hashed_token)throw new DemoFailure('DEMO_SESSION_ERROR');
 const client=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 const{data:verified,error}=await client.auth.verifyOtp({token_hash:link.properties.hashed_token,type:'magiclink'});
 if(error||!verified.session||verified.user?.id!==user.id)throw new DemoFailure('DEMO_SESSION_ERROR');
 return {client,session:verified.session};
}

async function ensureDemoUser(admin:SupabaseClient,url:string,anon:string,role:StaffDemoRole):Promise<string>{
 // Only reserved synthetic addresses are accepted. Existing accounts need an
 // immutable server marker; an open-registration email collision is not adopted.
 const{data:directory,error:listError}=await admin.auth.admin.listUsers({page:1,perPage:1000});
 if(listError)throw new DemoFailure('DEMO_SETUP_ERROR');
 let user=directory.users.find(account=>account.email?.toLowerCase()===demoEmails[role]);
 if(user&&!belongsToDemo(user,role))throw new DemoFailure('DEMO_ACCOUNT_CONFLICT');
 if(!user){
  // GoTrue's bcrypt limit is 72 bytes; 32 random bytes yield 64 ASCII chars.
  const random=crypto.getRandomValues(new Uint8Array(32));
  const password=Array.from(random,value=>value.toString(16).padStart(2,'0')).join('');
  const{data,error}=await admin.auth.admin.createUser({email:demoEmails[role],password,email_confirm:true,
   user_metadata:{full_name:role==='manager'?'SIMULACIÓN · Manager':'SIMULACIÓN · Enfermería'},
   app_metadata:{care_demo_owner:operatorId,care_demo_role:role},
  });
  if(error||!data.user||!belongsToDemo(data.user,role))throw new DemoFailure('DEMO_SETUP_ERROR');
  user=data.user;
 }
 const{client}=await mintDemoSession(admin,url,anon,user,role);
 try{
  const{data:factors,error:factorError}=await client.auth.mfa.listFactors();
  if(factorError)throw new DemoFailure('DEMO_FACTOR_ERROR');
  if(!factors.totp.some(factor=>factor.status==='verified')){
   // Remove only abandoned unverified factors belonging to this synthetic user.
   for(const factor of factors.all.filter(factor=>factor.factor_type==='totp'&&factor.status==='unverified')){
    const{error}=await client.auth.mfa.unenroll({factorId:factor.id});if(error)throw new DemoFailure('DEMO_FACTOR_ERROR');
   }
   const{data:enrolled,error:enrollError}=await client.auth.mfa.enroll({factorType:'totp',friendlyName:'SIMULACIÓN · Factor de pruebas'});
   if(enrollError||enrolled.type!=='totp')throw new DemoFailure('DEMO_FACTOR_ERROR');
   const code=await generateTotp(enrolled.totp.secret);
   const{error:verifyError}=await client.auth.mfa.challengeAndVerify({factorId:enrolled.id,code});
   if(verifyError)throw new DemoFailure('DEMO_FACTOR_ERROR');
  }
  return user.id;
 }finally{
  // This temporary setup session never reaches the browser.
  await client.auth.signOut({scope:'local'});
 }
}

Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('origin')??'';
 const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin',
  ...(allowedOrigins.includes(origin)?{'Access-Control-Allow-Origin':origin,
   'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS'}:{})};
 const reply=(status:number,body:Record<string,unknown>)=>new Response(JSON.stringify(body),{status,headers});
 if(origin&&!allowedOrigins.includes(origin))return reply(403,{code:'DEMO_FORBIDDEN',message:'Acceso no autorizado.'});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return reply(405,{message:'Método no permitido.'});
 const authorization=req.headers.get('authorization')??'';
 if(!authorization.startsWith('Bearer '))return reply(401,{message:'Inicia sesión con tu cuenta de Dirección general.'});
 try{
  const body=await readBody(req);
  if(!['status','setup','switch'].includes(String(body.action))||
   (body.action==='switch'&&!demoRoles.includes(body.role as DemoRole)))return reply(400,{code:'INVALID_BODY',message:'Selecciona una acción de pruebas válida.'});
  const url=Deno.env.get('SUPABASE_URL'),anon=Deno.env.get('SUPABASE_ANON_KEY'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!anon||!service)throw new DemoFailure('DEMO_CONFIG_ERROR');
  const caller=createClient(url,anon,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
  const{data:callerUser,error:authError}=await caller.auth.getUser();
  if(authError||callerUser.user?.id!==operatorId)return reply(403,{code:'DEMO_FORBIDDEN',message:'Estas pruebas están disponibles exclusivamente para Bruno.'});
  const{data:initialStatus,error:statusError}=await caller.rpc('get_demo_workspace_status');
  if(statusError)return reply(403,{code:'DEMO_FORBIDDEN',message:'Necesitas Dirección general activa y verificación inicial completada.'});
  if(body.action==='status')return reply(200,initialStatus);
  const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  if(body.action==='setup'){
   if(initialStatus.ready)return reply(200,initialStatus);
   const managerId=await ensureDemoUser(admin,url,anon,'manager');
   const nurseId=await ensureDemoUser(admin,url,anon,'nurse');
   const{error}=await admin.rpc('configure_demo_accounts',{p_operator_id:operatorId,p_manager_id:managerId,p_nurse_id:nurseId});
   if(error)throw new DemoFailure('DEMO_SCOPE_ERROR');
   const{data:status,error:finalError}=await caller.rpc('get_demo_workspace_status');
   if(finalError||!status?.ready)throw new DemoFailure('DEMO_SETUP_ERROR');
   return reply(200,status);
  }
  const role=body.role as DemoRole;
  const{data:target,error:targetError}=await admin.rpc('resolve_demo_target',{p_operator_id:operatorId,p_demo_role:role,p_audit:false});
  if(targetError||!target?.user_id||typeof target.email!=='string'||
   ((role==='manager'||role==='nurse')&&target.email!==demoEmails[role]))throw new DemoFailure('DEMO_SCOPE_ERROR');
  const{data:account,error:accountError}=await admin.auth.admin.getUserById(target.user_id);
  if(accountError||!account.user||account.user.id!==target.user_id||account.user.email!==target.email||!belongsToDemo(account.user,role))throw new DemoFailure('DEMO_ACCOUNT_CONFLICT');
  const{client,session}=await mintDemoSession(admin,url,anon,account.user,role);
  // A second check closes changes made while Auth minted the session. On failure
  // revoke this newly created session and return no credentials.
  const{data:checked,error:checkError}=await admin.rpc('resolve_demo_target',{p_operator_id:operatorId,p_demo_role:role});
  if(checkError||checked?.user_id!==target.user_id){await client.auth.signOut({scope:'local'});throw new DemoFailure('DEMO_SCOPE_ERROR');}
  return reply(200,{session:{access_token:session.access_token,refresh_token:session.refresh_token},role});
 }catch(error){
  const code=error instanceof DemoFailure?error.code:'DEMO_REQUEST_ERROR';
  const messages:Record<string,string>={
   INVALID_BODY:'La solicitud de pruebas no es válida.',
   DEMO_CONFIG_ERROR:'Falta configuración del servidor de pruebas.',
   DEMO_ACCOUNT_CONFLICT:'Una cuenta de prueba cambió o su correo ya pertenece a otra cuenta. Revisa su configuración.',
   DEMO_FACTOR_ERROR:'No se completó la verificación real de la cuenta de prueba. Reintenta su preparación.',
   DEMO_SCOPE_ERROR:'El rol o los permisos de prueba cambiaron. No se inició sesión; revisa Sedes y equipo.',
   DEMO_SETUP_ERROR:'No se completó la preparación. Puedes reintentar; los registros existentes se conservan.',
   DEMO_SESSION_ERROR:'No se pudo iniciar la sesión de prueba. Inténtalo nuevamente.',
   DEMO_REQUEST_ERROR:'No se pudo completar la prueba. Revisa la conexión y vuelve a intentarlo.',
  };
  return reply(code==='INVALID_BODY'?400:503,{code,message:messages[code]??messages.DEMO_REQUEST_ERROR});
 }
});

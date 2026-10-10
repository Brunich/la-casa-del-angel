import {createClient} from 'npm:@supabase/supabase-js@2.117.3';
const allowedOrigins=['https://la-casa-del-angel.vercel.app','https://localhost','capacitor://localhost'];
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validIds(value:unknown,limit:number):value is string[]{
 return Array.isArray(value)&&value.length<=limit&&value.every(id=>typeof id==='string'&&uuidPattern.test(id));
}
async function readBody(req:Request):Promise<unknown>{
 const reader=req.body?.getReader();if(!reader)throw new Error('INVALID_BODY');
 const chunks:Uint8Array[]=[];let bytes=0;
 try{for(;;){const{value,done}=await reader.read();if(done)break;bytes+=value.byteLength;
  if(bytes>32768){await reader.cancel();throw new Error('INVALID_BODY');}chunks.push(value);
 }}finally{reader.releaseLock();}
 const joined=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){joined.set(chunk,offset);offset+=chunk.length;}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(joined));
}
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('origin')??'';
 const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin',...(allowedOrigins.includes(origin)?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS'}:{})};
 const reply=(status:number,message:string,code?:string)=>new Response(JSON.stringify({message,...(code?{code}:{})}),{status,headers});
 if(origin&&!allowedOrigins.includes(origin))return reply(403,'Acceso no autorizado.');
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return reply(405,'Método no permitido.');
 const authorization=req.headers.get('authorization')??'';
 if(!authorization.startsWith('Bearer '))return reply(401,'Inicia sesión.');
 let preparationRequested=false,bodyParsed=false;
 try{
  const body=await readBody(req);bodyParsed=true;if(!body||typeof body!=='object'||Array.isArray(body))return reply(400,'Solicitud inválida.');
  const input=body as Record<string,unknown>,email=typeof input.email==='string'?input.email.trim().toLowerCase():'',name=typeof input.full_name==='string'?input.full_name.trim():'';
  if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||name.length<1||name.length>160)return reply(400,'Revisa el nombre y correo.');
  if(typeof input.role!=='string'||!['owner','manager','nurse','family'].includes(input.role)||input.verified!==true||
   !validIds(input.site_ids,30)||!validIds(input.resident_ids,200))return reply(400,'Confirma la identidad, el rol y sus sedes o residentes.','INVALID_INVITATION');
  const url=Deno.env.get('SUPABASE_URL')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const caller=createClient(url,anon,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
  const{data:user,error:authError}=await caller.auth.getUser();if(authError||!user.user)return reply(401,'Inicia sesión.');
  preparationRequested=true;
  const{data:attempt,error:permissionError}=await caller.rpc('prepare_account_invitation',{
   p_email:email,p_full_name:name,p_role:input.role,p_site_ids:input.site_ids,p_resident_ids:input.resident_ids,p_verified:true,
  });
  if(permissionError){
   if(permissionError.message==='CARE_INVITATION_IN_PROGRESS')return reply(409,'Ya hay una invitación en preparación o enviada para este correo. No se envió otra; revisa su estado o espera antes de repetirla.','INVITATION_IN_PROGRESS');
   if(permissionError.message==='ACCOUNT_EXISTS')return reply(409,'Esta persona ya tiene una cuenta. Selecciónala para dar permisos o cambiar su rol.','ACCOUNT_EXISTS');
   if(permissionError.message==='CARE_INVITATION_LIMIT')return reply(429,'Llegaste al límite de 30 invitaciones por hora. Inténtalo más tarde.','INVITATION_LIMIT');
   if(permissionError.code==='22023')return reply(400,'Revisa el rol, las sedes y los residentes elegidos.','INVALID_INVITATION');
   if(permissionError.code==='42501')return reply(403,'No se autorizó el envío. Revisa tus permisos y la verificación inicial.','INVITATION_FORBIDDEN');
   return reply(503,'No se confirmó el estado de la preparación. Revisa esta cuenta con administración antes de repetir el envío.','INVITATION_STATUS_PENDING');
  }
  if(typeof attempt!=='string'||!uuidPattern.test(attempt))return reply(503,'No se pudo preparar la invitación. Inténtalo después.','INVITATION_SERVER_ERROR');
  const admin=createClient(url,service,{auth:{persistSession:false}});
  const{error}=await admin.auth.admin.inviteUserByEmail(email,{data:{full_name:name},redirectTo:'https://la-casa-del-angel.vercel.app/cuenta'});
  const{error:completionError}=await admin.rpc('complete_account_invitation',{
   p_attempt_id:attempt,p_inviter_id:user.user.id,p_sent:!error,
  });
  if(error){
   if(['email_exists','user_already_exists'].includes(error.code??''))return reply(409,'Esta persona ya tiene una cuenta. Selecciónala para dar permisos o cambiar su rol.','ACCOUNT_EXISTS');
   return reply(502,'El servicio de correo no confirmó el envío. Los permisos no se han activado; revisa su estado antes de reenviar.','INVITATION_EMAIL_ERROR');
  }
  if(completionError)return reply(503,'El correo se envió, pero no se confirmó el plan de permisos. Revisa esta cuenta en pendientes; evita reenviar el correo.','INVITATION_STATUS_PENDING');
  return reply(200,'Invitación enviada con los permisos preparados. La persona acepta el correo y elige su contraseña; el personal completa su verificación inicial.');
 }catch{
  if(!bodyParsed)return reply(400,'Solicitud inválida.');
  if(preparationRequested)return reply(503,'No se confirmó el estado de esta invitación. Revisa la cuenta y el correo con administración antes de repetir el envío.','INVITATION_STATUS_PENDING');
  return reply(503,'El servicio de invitaciones no está disponible en este momento. Inténtalo más tarde o avisa a administración si continúa.','INVITATION_SERVER_ERROR');
 }
});

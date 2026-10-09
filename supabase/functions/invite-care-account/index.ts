import {createClient} from 'npm:@supabase/supabase-js@2.117.3';
const allowedOrigins=['https://la-casa-del-angel.vercel.app','https://localhost','capacitor://localhost'];
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('origin')??'';
 const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin',...(allowedOrigins.includes(origin)?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS'}:{})};
 const reply=(status:number,message:string,code?:string)=>new Response(JSON.stringify({message,...(code?{code}:{})}),{status,headers});
 if(origin&&!allowedOrigins.includes(origin))return reply(403,'Acceso no autorizado.');
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return reply(405,'Método no permitido.');
 const authorization=req.headers.get('authorization')??'';
 if(!authorization.startsWith('Bearer '))return reply(401,'Inicia sesión.');
 try{
  const bodyText=await req.text();if(bodyText.length>4096)return reply(400,'Solicitud inválida.');
  const body=JSON.parse(bodyText),email=typeof body.email==='string'?body.email.trim():'',name=typeof body.full_name==='string'?body.full_name.trim():'';
  if(email.length>254||!/^\S+@\S+\.\S+$/.test(email)||name.length<1||name.length>160)return reply(400,'Revisa el nombre y correo.');
  const url=Deno.env.get('SUPABASE_URL')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const caller=createClient(url,anon,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
  const{data:user,error:authError}=await caller.auth.getUser();if(authError||!user.user)return reply(401,'Inicia sesión.');
  const{error:permissionError}=await caller.rpc('reserve_account_invitation',{p_email:email});if(permissionError)return reply(403,'No se autorizó el envío. Revisa tus permisos o el límite de invitaciones.');
  const admin=createClient(url,service,{auth:{persistSession:false}});
  const{error}=await admin.auth.admin.inviteUserByEmail(email,{data:{full_name:name},redirectTo:'https://la-casa-del-angel.vercel.app/cuenta'});
  if(error){
   if(['email_exists','user_already_exists'].includes(error.code??''))return reply(409,'Esta persona ya tiene una cuenta. Selecciónala en Personas y roles o en Altas pendientes.','ACCOUNT_EXISTS');
   return reply(400,'No se confirmó el envío. Revisa el correo o inténtalo después.');
  }
  return reply(200,'Invitación enviada. La persona confirma el correo; después asigna su rol.');
 }catch{return reply(400,'No se confirmó el envío.');}
});

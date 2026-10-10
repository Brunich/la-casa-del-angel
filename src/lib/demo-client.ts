import {createClient,type SupabaseClient} from '@supabase/supabase-js';
import {ownerSupabase,setPortalClient} from './api';
import {AUTH_STORAGE_KEY,ACTIVITY_STORAGE_KEY} from './session-storage';
import {clearDeviceNotifications} from './notifications';

export type DemoRole='manager'|'nurse'|'family-one'|'family-two';
export const demoLabels:Record<DemoRole,string>={manager:'Managers',nurse:'Enfermería','family-one':'Familia Uno','family-two':'Familia Dos'};
interface DemoState {role:DemoRole|null;epoch:number}
let state:DemoState={role:null,epoch:0};
let demoClient:SupabaseClient|null=null;
let generation=0;
const listeners=new Set<()=>void>();
export const getDemoState=()=>state;
export function subscribeDemo(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}
function publish(role:DemoRole|null){state={role,epoch:state.epoch+1};listeners.forEach(listener=>listener());}
async function closeDemo(client:SupabaseClient|null){if(!client)return;await client.auth.stopAutoRefresh();await client.auth.signOut({scope:'local'});}

export async function returnToOwner(){
 generation++;const previous=demoClient;demoClient=null;setPortalClient(ownerSupabase);publish(null);
 const results=await Promise.allSettled([clearDeviceNotifications(),closeDemo(previous)]);
 if(results.some(result=>result.status==='rejected'))throw new Error('Volviste a Dirección general. No se confirmó el cierre de todos los avisos o sesiones de prueba; revisa la conexión y los avisos del dispositivo.');
}
export async function signOutAllSessions(){
 generation++;const previous=demoClient;demoClient=null;setPortalClient(ownerSupabase);publish(null);
 await Promise.allSettled([closeDemo(previous),ownerSupabase?.auth.signOut({scope:'local'})]);
 sessionStorage.removeItem(AUTH_STORAGE_KEY);sessionStorage.removeItem(ACTIVITY_STORAGE_KEY);
}
export async function enterDemo(role:DemoRole){
 if(!ownerSupabase)throw new Error('El acceso privado no está configurado.');
 const ticket=++generation;
 const {data,error}=await ownerSupabase.functions.invoke('demo-session',{body:{action:'switch',role}});
 if(error){
  if('context' in error&&error.context instanceof Response){
   const detail=await error.context.json().catch(()=>null);
   const messages:Record<string,string>={DEMO_SCOPE_ERROR:'El rol o los permisos de prueba cambiaron. Revisa Sedes y equipo; no se abrió la cuenta.',DEMO_FACTOR_ERROR:'Falta completar la verificación de las cuentas de prueba. Vuelve a preparar la simulación.',DEMO_FORBIDDEN:'Tu cuenta necesita Dirección general activa y su verificación inicial para usar la simulación.'};
   if(typeof detail?.code==='string'&&messages[detail.code])throw new Error(messages[detail.code]);
  }
  throw new Error('No se pudo abrir la cuenta de prueba. Revisa tu sesión, la conexión y la preparación de la simulación.');
 }
 if(data?.role!==role||typeof data?.session?.access_token!=='string'||typeof data?.session?.refresh_token!=='string')throw new Error('El servidor no confirmó una sesión de prueba válida.');
 const candidate=createClient(import.meta.env.VITE_SUPABASE_URL,import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,{global:{fetch:(input,options)=>fetch(input,{...options,cache:'no-store'})},auth:{persistSession:false,storageKey:'casa-angel-demo-memory',detectSessionInUrl:false,autoRefreshToken:true}});
 let committed=false;
 try{
  const {error:sessionError}=await candidate.auth.setSession(data.session);
  if(sessionError)throw new Error('La sesión de prueba no se pudo comprobar.');
  const {data:user,error:userError}=await candidate.auth.getUser();
  if(userError||!user.user)throw new Error('La cuenta de prueba no se pudo comprobar.');
  const {data:profile,error:profileError}=await candidate.from('profiles').select('role,active').eq('id',user.user.id).single();
  const expectedRole=role==='family-one'||role==='family-two'?'family':role;
  if(profileError||!profile?.active||profile.role!==expectedRole)throw new Error('Los permisos de la cuenta de prueba no están listos.');
  await clearDeviceNotifications();
  if(ticket!==generation)throw new Error('El cambio de cuenta se canceló porque la sesión cambió.');
  const previous=demoClient;demoClient=candidate;setPortalClient(candidate);committed=true;publish(role);
  await closeDemo(previous);
 }catch(cause){if(!committed)await closeDemo(candidate);throw cause;}
}

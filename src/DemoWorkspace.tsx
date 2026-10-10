import {useEffect,useRef,useState,useSyncExternalStore,type ReactNode} from 'react';
import {ArrowLeft,FlaskConical,UserRoundCog,Stethoscope,HeartHandshake} from 'lucide-react';
import {ownerSupabase} from './lib/api';
import {enterDemo,getDemoState,returnToOwner,subscribeDemo,demoLabels,type DemoRole} from './lib/demo-client';
import './demo-workspace.css';
export function DemoWorkspace({children}:{children:(epoch:number)=>ReactNode}){
 const demo=useSyncExternalStore(subscribeDemo,getDemoState);
 const [eligible,setEligible]=useState(false),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [families,setFamilies]=useState<DemoRole[]>([]);
 const alive=useRef(false),request=useRef(0),inFlight=useRef(false);
 useEffect(()=>{alive.current=true;const ticket=++request.current;
  void(async()=>{
   if(!ownerSupabase)return;
   const {data:user}=await ownerSupabase.auth.getUser();if(!alive.current||ticket!==request.current||!user.user)return;
   const {data:profile}=await ownerSupabase.from('profiles').select('role,active').eq('id',user.user.id).maybeSingle();
   if(!alive.current||ticket!==request.current||profile?.role!=='owner'||!profile.active)return;
   const {data,error}=await ownerSupabase.functions.invoke('demo-session',{body:{action:'status'}});
   if(!alive.current||ticket!==request.current)return;
   if(error&&'context' in error&&error.context instanceof Response&&[401,403].includes(error.context.status))return;
   setEligible(true);
   if(error)setMessage('No se pudo consultar la simulación. Puedes volver a comprobarla cuando haya conexión.');
   else {setReady(data?.ready===true);setFamilies(Array.isArray(data?.families)?data.families.filter((role:unknown)=>role==='family-one'||role==='family-two'):[]);}
  })().catch(()=>{if(alive.current&&ticket===request.current)setMessage('No se pudo consultar la simulación. Vuelve a intentar.');});
  return()=>{alive.current=false;request.current++;};
 },[]);
 async function run(action:'status'|'setup'|'return'|DemoRole){
  if(inFlight.current)return;inFlight.current=true;setBusy(true);setMessage('');
  try{
   if(action==='return')await returnToOwner();
   else if(action==='setup'||action==='status'){
    const {data,error}=await ownerSupabase!.functions.invoke('demo-session',{body:{action}});
    if(error||(action==='setup'&&data?.ready!==true))throw new Error('No se completó la comprobación. Revisa la conexión y vuelve a comprobar el estado antes de repetir.');
    if(alive.current){setReady(data?.ready===true);setFamilies(Array.isArray(data?.families)?data.families.filter((role:unknown)=>role==='family-one'||role==='family-two'):[]);setMessage(data?.ready===true?'Simulación preparada: un Manager, Enfermería y tres residentes ficticios.':'La simulación todavía no está preparada. Usa Crear cuentas y residentes de prueba.');}
   }else await enterDemo(action);
  }catch(cause){if(alive.current)setMessage(cause instanceof Error?cause.message:'No se pudo completar la acción.');}
  finally{inFlight.current=false;if(alive.current)setBusy(false);}
 }
 return <>
  {(eligible||demo.role)&&<section className={`demo-workspace${demo.role?' demo-workspace-active':''}`} aria-label="Cuentas de simulación">
   <div className="demo-workspace-heading"><FlaskConical size={24} aria-hidden="true"/><div><strong>{demo.role?'SIMULACIÓN · '+demoLabels[demo.role]:'Probar el portal con cuentas ficticias'}</strong><p>{demo.role?'Estás usando una cuenta de prueba real, con permisos limitados a los residentes de simulación.':'Solo estas cuentas de prueba permiten cambiar de sesión. Termina cualquier registro antes de cambiar; las demás cuentas no se pueden abrir desde aquí.'}</p></div></div>
   <div className="demo-workspace-actions">
    {demo.role&&<button type="button" className="button small" disabled={busy} onClick={()=>void run('return')}><ArrowLeft size={18} aria-hidden="true"/> Volver a Dirección general</button>}
    {ready?<><button type="button" className="button small outline" disabled={busy||demo.role==='manager'} onClick={()=>void run('manager')}><UserRoundCog size={18} aria-hidden="true"/> Entrar como Manager</button><button type="button" className="button small outline" disabled={busy||demo.role==='nurse'} onClick={()=>void run('nurse')}><Stethoscope size={18} aria-hidden="true"/> Entrar como Enfermería</button></>:<button type="button" className="button small" disabled={busy} onClick={()=>void run('setup')}>Crear cuentas y residentes de prueba</button>}
   </div>
   {families.length>0&&<div className="demo-workspace-actions" aria-label="Familias de prueba">{families.map(role=><button key={role} type="button" className="button small outline" disabled={busy||demo.role===role} onClick={()=>void run(role)}><HeartHandshake size={18} aria-hidden="true"/> Entrar como {demoLabels[role]}</button>)}</div>}
   {busy&&<p role="status">Comprobando la cuenta y sus permisos…</p>}
   {message&&<><p className="message" role="status">{message}</p>{!demo.role&&<button className="text-link" type="button" disabled={busy} onClick={()=>void run('status')}>Volver a comprobar la simulación</button>}</>}
  </section>}
  {children(demo.epoch)}
 </>;
}

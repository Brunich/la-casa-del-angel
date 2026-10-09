import {useState,type FormEvent} from 'react';
import {UserPlus} from 'lucide-react';
import {supabase} from './lib/api';
import type {Resident} from './domain';

interface Account {id:string;full_name:string;email:string;confirmed:boolean;requested_site_id?:string|null}
interface Props {accounts:Account[];residents:Resident[];sites:{id:string;name:string}[];onUpdated:()=>void}

export function ManagerOnboarding({accounts,residents,sites,onUpdated}:Props){
 const[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(false);
 const[accountId,setAccountId]=useState(''),[email,setEmail]=useState(''),[name,setName]=useState('');
 const[manual,setManual]=useState(false),[role,setRole]=useState('nurse');
 const[siteId,setSiteId]=useState(''),[residentId,setResidentId]=useState('');
 const[verified,setVerified]=useState(false);
 function chooseAccount(id:string){
  const account=accounts.find(a=>a.id===id);setAccountId(id);setEmail(account?.email??'');setName(account?.full_name??'');setSiteId(sites.find(s=>s.id===account?.requested_site_id)?.id??'');setResidentId('');setMessage('');setVerified(false);
 }
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(busy||!supabase)return;
  const form=e.currentTarget;const f=new FormData(form);setBusy(true);setMessage('');setError(false);
  try{
   const{error}=await supabase.rpc('onboard_care_account',{p_email:email.trim(),p_full_name:name.trim(),p_role:role,p_resident_id:String(f.get('resident'))||null,p_site_id:String(f.get('site'))||null,p_verified:verified});
   if(error)throw error;
   setMessage('Acceso habilitado y asignación guardada.');form.reset();setAccountId('');setEmail('');setName('');setRole('nurse');setSiteId('');setResidentId('');setVerified(false);onUpdated();
  }catch{
   setError(true);setMessage('No se confirmó el alta. Revisa que la persona ya tenga una cuenta, haya confirmado su correo y que la sede y el residente estén dentro de tu alcance. Para cambiar un rol existente, usa Cuentas y roles.');
  }finally{setBusy(false)}
 }
 return <section className="form-panel" aria-labelledby="onboarding-heading">
  <h2 id="onboarding-heading"><UserPlus size={22} aria-hidden="true"/> Habilitar acceso a una persona</h2>
  <p>Selecciona una cuenta que todavía no tiene rol. Asigna Enfermería para trabajar en una sede o Familia para consultar un expediente autorizado. La persona debe haber confirmado su correo.</p>
  <form onSubmit={submit} onChange={e=>{if(e.target.getAttribute('name')!=='verified')setVerified(false)}} aria-busy={busy}><fieldset disabled={busy}>
   <label>Persona lista para asignar rol<select value={accountId} required={!manual} disabled={manual} onChange={e=>chooseAccount(e.target.value)}><option value="">Seleccionar persona</option>{accounts.filter(a=>a.confirmed).map(a=><option key={a.id} value={a.id}>{a.full_name||a.email} · {a.email}</option>)}</select></label>
   {accounts.length===0&&<p className="caption">No hay cuentas pendientes de alta en tu alcance. Una cuenta nueva debe crearse y confirmar su correo antes de habilitar el acceso.</p>}
   {(accountId||manual)&&<><div className="field-grid">
    <label>Nombre completo<input name="name" value={name} onChange={e=>setName(e.target.value)} required maxLength={160}/></label>
    <label>Rol<select name="role" value={role} onChange={e=>setRole(e.target.value)}><option value="nurse">Enfermería</option><option value="family">Familia</option></select></label>
    <label>Sede<select name="site" value={siteId} onChange={e=>{setSiteId(e.target.value);setResidentId('');}}><option value="">Usar sede del residente</option>{sites.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
    <label>Residente autorizado<select name="resident" value={residentId} onChange={e=>setResidentId(e.target.value)} required={role==='family'}><option value="">{role==='family'?'Seleccionar residente':'Solo sede (enfermería)'}</option>{residents.filter(r=>!siteId||r.site_id===siteId).map(r=><option key={r.id} value={r.id}>{r.full_name}</option>)}</select></label>
   </div>
   <p className="caption">Enfermería necesita una sede; también puedes asignarle un residente. Familia necesita seleccionar el residente cuyo expediente podrá consultar.</p>
   <label className="checkbox"><input name="verified" type="checkbox" checked={verified} onChange={e=>setVerified(e.target.checked)} required/>Verifiqué identidad, representación y autorización del acceso</label>
   <button className="button" disabled={!manual&&!accountId}>{busy?'Confirmando…':'Habilitar acceso y guardar asignación'}</button></>}
   <details onToggle={e=>{setManual(e.currentTarget.open);setMessage('');setVerified(false);}}><summary>Entrada manual para una cuenta existente</summary><p className="caption">Introduce el correo confirmado de una cuenta que ya existe. Esta acción no crea una cuenta ni envía una invitación.</p><label>Correo de la cuenta<input name="email" type="email" value={email} onChange={e=>{setEmail(e.target.value);setAccountId('');}} required={manual} disabled={!manual} autoComplete="off"/></label></details>
  </fieldset></form>
  {accounts.some(a=>!a.confirmed)&&<details><summary>Invitaciones esperando confirmación</summary><p>Estas personas aún deben abrir el correo. Después aparecerán en el selector de alta.</p><ul>{accounts.filter(a=>!a.confirmed).map(a=><li key={a.id}>{a.full_name} · {a.email}</li>)}</ul></details>}
  {message&&<p className={error?'message error':'message'} role={error?'alert':'status'}>{message}</p>}
 </section>;
}

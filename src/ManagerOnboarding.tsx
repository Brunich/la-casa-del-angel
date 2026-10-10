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
 const[siteIds,setSiteIds]=useState<string[]>([]),[residentIds,setResidentIds]=useState<string[]>([]);
 const[verified,setVerified]=useState(false);
 const incompleteFamilyScope=role==='family'&&siteIds.some(id=>!residents.some(r=>r.site_id===id&&residentIds.includes(r.id)));
 function chooseAccount(id:string){
  const account=accounts.find(a=>a.id===id),requested=sites.find(s=>s.id===account?.requested_site_id)?.id;setAccountId(id);setEmail(account?.email??'');setName(account?.full_name??'');setSiteIds(requested?[requested]:[]);setResidentIds([]);setMessage('');setVerified(false);
 }
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(busy||!supabase)return;
  if(!verified||siteIds.length===0||(role==='family'&&(residentIds.length===0||incompleteFamilyScope)))return;
  setBusy(true);setMessage('');setError(false);
  try{
   const{error}=await supabase.rpc('onboard_care_scopes',{p_email:email.trim(),p_full_name:name.trim(),p_role:role,p_resident_ids:residentIds,p_site_ids:siteIds,p_verified:verified});
   if(error)throw error;
   setMessage('Acceso habilitado. Las sedes y los residentes seleccionados quedaron asignados.');setAccountId('');setEmail('');setName('');setRole('nurse');setSiteIds([]);setResidentIds([]);setVerified(false);onUpdated();
  }catch{
   setError(true);setMessage('No se confirmó el alta. Revisa el correo confirmado y que todas las sedes y residentes elegidos estén dentro de tus permisos. Para cambiar un rol existente, usa Sedes y equipo → Cambiar rol del perfil.');
  }finally{setBusy(false)}
 }
 return <section className="form-panel" aria-labelledby="onboarding-heading">
  <h2 id="onboarding-heading"><UserPlus size={22} aria-hidden="true"/> Dar de alta cuenta nueva, pendiente</h2>
  <p>Familiares o staff nuevo por confirmar acceso a su rol. Elige una cuenta con correo confirmado y revisa sus sedes y residentes autorizados.</p>
  <form onSubmit={submit} onChange={e=>{if(e.target.getAttribute('name')!=='verified')setVerified(false)}} aria-busy={busy}><fieldset disabled={busy}>
   <label>Persona lista para asignar rol<select value={accountId} required={!manual} disabled={manual} onChange={e=>chooseAccount(e.target.value)}><option value="">Seleccionar persona</option>{accounts.filter(a=>a.confirmed).map(a=><option key={a.id} value={a.id}>{a.full_name||a.email} · {a.email}</option>)}</select></label>
   {accounts.length===0&&<p className="caption">No hay cuentas pendientes de alta en tu alcance. Una cuenta nueva debe crearse y confirmar su correo antes de habilitar el acceso.</p>}
   {(accountId||manual)&&<><div className="field-grid">
    <label>Nombre completo<input name="name" value={name} onChange={e=>setName(e.target.value)} required maxLength={160}/></label>
    <label>Rol<select name="role" value={role} onChange={e=>{setRole(e.target.value);setResidentIds([]);}}><option value="nurse">Enfermería</option><option value="family">Familia</option></select></label>
   </div>
   <fieldset className="scope-checklist"><legend>Sedes · puedes elegir varias</legend><div>{sites.map(s=><label className="checkbox" key={s.id}><input type="checkbox" name="sites" checked={siteIds.includes(s.id)} onChange={e=>{const next=e.target.checked?[...siteIds,s.id]:siteIds.filter(id=>id!==s.id);setSiteIds(next);setResidentIds(current=>current.filter(id=>residents.some(r=>r.id===id&&next.includes(r.site_id))));}}/><span>{s.name}</span></label>)}</div>{sites.length===0&&<p className="caption">Aún no hay sedes disponibles para tu cuenta. Dirección general debe registrar la sede o autorizar tu acceso.</p>}</fieldset>
   <fieldset className="scope-checklist"><legend>{role==='family'?'Residentes autorizados · elige uno o varios':'Residentes a cargo (opcional al dar de alta)'}</legend><div>{residents.filter(r=>siteIds.includes(r.site_id)).map(r=><label className="checkbox" key={r.id}><input type="checkbox" name="residents" checked={residentIds.includes(r.id)} onChange={e=>setResidentIds(e.target.checked?[...residentIds,r.id]:residentIds.filter(id=>id!==r.id))}/><span>{r.full_name} · {sites.find(s=>s.id===r.site_id)?.name}</span></label>)}</div>{residents.filter(r=>siteIds.includes(r.site_id)).length===0&&<p className="caption">Selecciona una sede con residentes registrados para elegir sus expedientes.</p>}</fieldset>
   <p className="caption">{role==='family'?'Elige al menos un residente de cada sede marcada. Familia solo verá los residentes seleccionados; marcar una sede nunca da acceso a todos sus expedientes.':'Enfermería trabajará en las sedes seleccionadas y solo verá los residentes asignados. Puedes añadirlos después en Sedes y equipo.'}</p>
   <label className="checkbox"><input name="verified" type="checkbox" checked={verified} onChange={e=>setVerified(e.target.checked)} required/>Verifiqué identidad, representación y autorización del acceso</label>
   <button className="button" disabled={(!manual&&!accountId)||!verified||siteIds.length===0||(role==='family'&&(residentIds.length===0||incompleteFamilyScope))}>{busy?'Confirmando…':'Confirmar rol y dar acceso'}</button></>}
   <details onToggle={e=>{setManual(e.currentTarget.open);setMessage('');setVerified(false);}}><summary>Entrada manual para una cuenta existente</summary><p className="caption">Introduce el correo confirmado de una cuenta que ya existe. Esta acción no crea una cuenta ni envía una invitación.</p><label>Correo de la cuenta<input name="email" type="email" value={email} onChange={e=>{setEmail(e.target.value);setAccountId('');}} required={manual} disabled={!manual} autoComplete="off"/></label></details>
  </fieldset></form>
  {accounts.some(a=>!a.confirmed)&&<details><summary>Invitaciones esperando confirmación</summary><p>Estas personas aún deben abrir el correo. Después aparecerán en el selector de alta.</p><ul>{accounts.filter(a=>!a.confirmed).map(a=><li key={a.id}>{a.full_name} · {a.email}</li>)}</ul></details>}
  {message&&<p className={error?'message error':'message'} role={error?'alert':'status'}>{message}</p>}
 </section>;
}

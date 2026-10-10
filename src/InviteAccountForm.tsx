import {useEffect,useRef,useState,type FormEvent} from 'react';
import {supabase} from './lib/api';
import {CheckCircle2,MailPlus,Plus,Trash2} from 'lucide-react';
import {InvitationError,inviteAccount} from './lib/admin-api';
import {roleNames,type Profile,type Resident,type Role} from './domain';
import './invitations.css';
interface Props {profile:Profile;sites:{id:string;name:string}[];residents:Resident[];onUpdated:()=>void}
interface Person {id:number;name:string;email:string;status:'draft'|'sending'|'sent'|'error'|'review';message:string}
const newPerson=(id:number):Person=>({id,name:'',email:'',status:'draft',message:''});
export function InviteAccountForm({profile,sites,residents,onUpdated}:Props){
 const [people,setPeople]=useState<Person[]>([newPerson(1)]);
 const [role,setRole]=useState<Role>('nurse'),[siteIds,setSiteIds]=useState<string[]>([]),[residentIds,setResidentIds]=useState<string[]>([]);
 const [verified,setVerified]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const nextId=useRef(2),inFlight=useRef(false);
 const mounted=useRef(false),actorClient=useRef(supabase).current;
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 const owner=profile.role==='owner';
 if(!owner&&profile.role!=='manager')return null;
 const eligibleResidents=residents.filter(r=>r.active&&siteIds.includes(r.site_id));
 const familyComplete=role!=='family'||(residentIds.length>0&&siteIds.every(id=>eligibleResidents.some(r=>r.site_id===id&&residentIds.includes(r.id))));
 const readyScope=(role==='owner'||siteIds.length>0)&&familyComplete;
 const remaining=people.filter(person=>!['sent','review'].includes(person.status));
 function changePerson(id:number,field:'name'|'email',value:string){setVerified(false);setError('');setPeople(current=>current.map(person=>person.id===id?{...person,[field]:value,status:'draft',message:''}:person));}
 function changeScope(){setVerified(false);setError('');}
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(inFlight.current||!verified||!readyScope||remaining.length===0)return;
  const emails=remaining.map(person=>person.email.trim().toLowerCase());
  if(new Set(emails).size!==emails.length){setError('Hay correos repetidos. Cada persona debe tener su propia cuenta.');return;}
  if(remaining.some(person=>!person.name.trim()||!/^\S+@\S+\.\S+$/.test(person.email.trim()))){setError('Revisa el nombre y el correo de cada persona.');return;}
  inFlight.current=true;setBusy(true);setError('');let sent=0;
  try{
   for(const person of remaining){
    if(!mounted.current||supabase!==actorClient)break;
    setPeople(current=>current.map(row=>row.id===person.id?{...row,status:'sending',message:'Enviando invitación…'}:row));
    try{
     await inviteAccount({email:person.email,fullName:person.name,role,siteIds:role==='owner'?[]:siteIds,residentIds:role==='nurse'||role==='family'?residentIds:[],verified});
     sent++;setPeople(current=>current.map(row=>row.id===person.id?{...row,status:'sent',message:'Invitación enviada con el rol y permisos elegidos.'}:row));
    }catch(cause){const review=!(cause instanceof InvitationError)||['INVITATION_EMAIL_ERROR','INVITATION_STATUS_PENDING','INVITATION_UNKNOWN'].includes(cause.code);setPeople(current=>current.map(row=>row.id===person.id?{...row,status:review?'review':'error',message:cause instanceof Error?cause.message:'No se confirmó el envío. Actualiza las cuentas antes de repetirlo.'}:row));}
   }
  }finally{inFlight.current=false;if(mounted.current){setBusy(false);setVerified(false);if(sent>0)onUpdated();}}
 }
 return <section className="form-panel invitation-panel" aria-labelledby="invite-account-heading">
  <h2 id="invite-account-heading"><MailPlus size={23} aria-hidden="true"/> Invitar con rol y permisos</h2>
  <p>Da de alta a una persona por correo. Ella acepta la invitación y crea su contraseña. Estos permisos se activan cuando confirma la invitación.</p>
  <form onSubmit={submit} aria-busy={busy}><fieldset disabled={busy}>
   <div className="invitation-people">{people.map((person,index)=><div className="invitation-person" key={person.id}>
    {people.length>1&&<h3>Persona {index+1}</h3>}
    <div className="field-grid"><label>Nombre completo<input value={person.name} onChange={event=>changePerson(person.id,'name',event.target.value)} required={!['sent','review'].includes(person.status)} disabled={['sent','review'].includes(person.status)} maxLength={160} autoComplete="name"/></label><label>Correo electrónico<input type="email" value={person.email} onChange={event=>changePerson(person.id,'email',event.target.value)} required={!['sent','review'].includes(person.status)} disabled={['sent','review'].includes(person.status)} maxLength={254} autoComplete="email"/></label></div>
    {people.length>1&&person.status!=='sent'&&<button className="text-link" type="button" onClick={()=>{setPeople(current=>current.filter(row=>row.id!==person.id));changeScope();}}><Trash2 size={17} aria-hidden="true"/> Quitar persona {index+1}</button>}
    {person.message&&<p className={person.status==='error'?'message error':person.status==='review'?'message warning':'message'} role={person.status==='error'||person.status==='review'?'alert':'status'}>{person.status==='sent'&&<CheckCircle2 size={18} aria-hidden="true"/>} {person.message}</p>}
   </div>)}</div>
   {people.length<10&&<button className="text-link invitation-add" type="button" onClick={()=>{setPeople(current=>[...current,newPerson(nextId.current++)]);changeScope();}}><Plus size={18} aria-hidden="true"/> Añadir otra persona</button>}
   <div className="invitation-permissions"><h3>Rol y permisos de estas invitaciones</h3>
    {people.length>1&&<p className="caption">El mismo rol, sedes y residentes seleccionados se aplican a todas las invitaciones pendientes de este formulario. Los envíos ya confirmados conservan sus permisos anteriores.</p>}
    <label>Rol<select value={role} onChange={event=>{setRole(event.target.value as Role);setSiteIds([]);setResidentIds([]);changeScope();}}>{(['nurse','family',...(owner?['manager','owner']:[])] as Role[]).map(value=><option key={value} value={value}>{roleNames[value]}</option>)}</select></label>
    {role==='owner'?<p className="message">Dirección general podrá administrar todas las sedes, residentes y roles. Concede este acceso únicamente a quien deba dirigir la residencia.</p>:<fieldset className="scope-checklist"><legend>Sedes autorizadas · puedes elegir varias</legend><div>{sites.map(site=><label className="checkbox" key={site.id}><input type="checkbox" checked={siteIds.includes(site.id)} onChange={event=>{const next=event.target.checked?[...siteIds,site.id]:siteIds.filter(id=>id!==site.id);setSiteIds(next);setResidentIds(current=>current.filter(id=>residents.some(resident=>resident.id===id&&next.includes(resident.site_id))));changeScope();}}/><span>{site.name}</span></label>)}</div>{sites.length===0&&<p className="caption">No tienes sedes autorizadas. Dirección general debe añadir o asignar una sede antes de invitar a este rol.</p>}</fieldset>}
    {(role==='nurse'||role==='family')&&<fieldset className="scope-checklist"><legend>{role==='family'?'Residentes que podrá consultar':'Residentes a cargo · opcional'}</legend><div>{eligibleResidents.map(resident=><label className="checkbox" key={resident.id}><input type="checkbox" checked={residentIds.includes(resident.id)} onChange={event=>{setResidentIds(event.target.checked?[...residentIds,resident.id]:residentIds.filter(id=>id!==resident.id));changeScope();}}/><span>{resident.full_name} · {sites.find(site=>site.id===resident.site_id)?.name}</span></label>)}</div>{eligibleResidents.length===0&&<p className="caption">Selecciona una sede con residentes activos para asignar expedientes.</p>}</fieldset>}
    {role==='family'&&<p className="caption">Elige al menos un residente de cada sede marcada. Familia solo verá los expedientes seleccionados.</p>}
    {role==='nurse'&&<p className="caption">Enfermería verá únicamente sus residentes asignados. Puedes asignarlos después en Sedes y equipo.</p>}
    {role!=='family'&&<p className="caption">El personal configura su autenticador en el primer acceso. Cada persona crea su propia contraseña.</p>}
    <label className="checkbox"><input type="checkbox" checked={verified} onChange={event=>setVerified(event.target.checked)} required={remaining.length>0}/>Confirmé la identidad, el correo y la autorización de estos permisos para cada persona</label>
    {error&&<p className="message error" role="alert">{error}</p>}
    <button className="button" disabled={!verified||!readyScope||remaining.length===0}>{busy?'Enviando invitaciones…':remaining.length>1?`Enviar ${remaining.length} invitaciones`:'Enviar invitación con permisos'}</button>
    {people.some(person=>person.status==='sent')&&<p className="caption">Los envíos confirmados no se repetirán. Una persona que ya creó su cuenta se administra desde Sedes y equipo o se aprueba en el apartado siguiente.</p>}
   </div>
  </fieldset></form>
 </section>;
}

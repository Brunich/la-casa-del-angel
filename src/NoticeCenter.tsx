import {useEffect,useRef,useState} from 'react';

import {Bell,UserRoundPlus,Pill,CalendarClock,ArrowRight} from 'lucide-react';

import {supabase} from './lib/api';

import {dailyCareGaps,type DailyResident} from './lib/daily-care';

import {getAdminAccounts} from './lib/admin-api';

import {medicationForecast,type Profile,type MedicationPlan,type Reminder} from './domain';

export function NoticeCenter({profile,plans,reminders,onAccounts,onCare,onActivate,notificationsActive=false}:{profile:Profile;plans:MedicationPlan[];reminders:Reminder[];onAccounts:()=>void;onCare:(residentId:string,tab:'reminders'|'medication'|'missing')=>void;onActivate?:()=>void;notificationsActive?:boolean}){

 const[open,setOpen]=useState(false),[pendingAccounts,setPendingAccounts]=useState(0);

 const[missing,setMissing]=useState<{id:string;name:string;count:number}[]>([]),[reviewError,setReviewError]=useState('');

 const staff=['owner','manager','nurse'].includes(profile.role);

 useEffect(()=>{setMissing([]);setReviewError('');if(!staff)return;let alive=true;const actor=supabase;async function refresh(){const result=await actor?.rpc('get_daily_care_status');if(!alive||actor!==supabase)return;if(result?.error){setMissing([]);setReviewError('La revisión de cuidados del día no está disponible. Abre Fotos faltantes para volver a intentar.');return;}setReviewError('');setMissing((result?.data?.residents??[]).map((resident:DailyResident)=>({id:resident.id,name:resident.name,count:dailyCareGaps(resident).length})).filter((row:{count:number})=>row.count>0));}void refresh();const timer=setInterval(()=>void refresh(),60000);return()=>{alive=false;clearInterval(timer)};},[profile.id,profile.role,staff]);

 const toggleRef=useRef<HTMLButtonElement>(null);

 function close(){setOpen(false);toggleRef.current?.focus();}

 useEffect(()=>{if(!open)return;const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();setOpen(false);toggleRef.current?.focus();}};document.addEventListener('keydown',escape);return()=>document.removeEventListener('keydown',escape);},[open]);

 const manage=['owner','manager'].includes(profile.role);

 useEffect(()=>{setPendingAccounts(0);if(!manage)return;let alive=true;async function refresh(){try{const accounts=await getAdminAccounts();if(alive)setPendingAccounts(accounts.filter(a=>a.role===null&&a.confirmed).length)}catch{if(alive)setPendingAccounts(0)}}void refresh();const timer=setInterval(()=>void refresh(),60000);return()=>{alive=false;clearInterval(timer)}},[profile.id,profile.role,manage]);

 const due=reminders.filter(r=>!r.completed_at&&!r.cancelled_at&&new Date(r.due_at).getTime()<=Date.now());

 const low=plans.filter(p=>p.active&&medicationForecast(p).lowStock);

 const count=(staff?missing.length:0)+due.length+low.length+(manage&&pendingAccounts>0?1:0);

 function navigate(action:()=>void){setOpen(false);action()}

 return <section className="notice-center"><button ref={toggleRef} className="compact-tool notice-toggle" aria-label={`Avisos${count?` · ${count} nuevos`:''}`} aria-expanded={open} aria-controls="notice-list" onClick={()=>setOpen(!open)}><Bell size={18} aria-hidden="true"/><small>Avisos</small>{count>0&&<span className="count">{count}</span>}</button>{open&&<div id="notice-list" className="notice-popover form-panel"><div className="panel-heading"><h2>Lo importante, a mano</h2><button type="button" className="text-link" onClick={close}>Cerrar</button></div>{onActivate&&<button type="button" className="button small outline" onClick={onActivate}>{notificationsActive?'Avisos del dispositivo activos':'Activar avisos del dispositivo'}</button>}<p>Los avisos internos funcionan aunque no actives notificaciones del celular y muestran solo lo autorizado para tu rol. En una urgencia, contacta directamente al personal responsable.</p>{staff&&reviewError&&<p role="alert" className="message warning">{reviewError}</p>}{staff&&missing.map(row=><button key={row.id} className="notice-item" onClick={()=>navigate(()=>onCare(row.id,'missing'))}><CalendarClock aria-hidden="true"/><span><strong>{row.name}: {row.count} cuidados o fotos por completar hoy</strong><small>Lista diaria · No indica retraso sin horarios</small></span><ArrowRight size={18}/></button>)}{count===0&&!reviewError&&<p role="status">No hay pendientes en esta revisión.</p>}{manage&&pendingAccounts>0&&<button className="notice-item" onClick={()=>navigate(onAccounts)}><UserRoundPlus aria-hidden="true"/><span><strong>{pendingAccounts} {pendingAccounts===1?'persona lista':'personas listas'} para asignar rol</strong><small>Correo confirmado · Abrir cuentas pendientes</small></span><ArrowRight size={18}/></button>}{due.map(r=><button key={r.id} className="notice-item" onClick={()=>navigate(()=>onCare(r.resident_id,'reminders'))}><CalendarClock aria-hidden="true"/><span><strong>Cuidado pendiente de registrar</strong><small>Abrir sus recordatorios</small></span><ArrowRight size={18}/></button>)}{low.map(p=><button key={p.id} className="notice-item" onClick={()=>navigate(()=>onCare(p.resident_id,'medication'))}><Pill aria-hidden="true"/><span><strong>{p.name}: existencia baja</strong><small>{p.stock_remaining} {p.stock_unit} · Revisar reposición</small></span><ArrowRight size={18}/></button>)}</div>}</section>;

}

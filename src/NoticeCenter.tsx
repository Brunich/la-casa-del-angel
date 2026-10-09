import {useEffect,useState} from 'react';
import {Bell,UserRoundPlus,Pill,CalendarClock,ArrowRight} from 'lucide-react';
import {getAdminAccounts} from './lib/admin-api';
import {medicationForecast,type Profile,type MedicationPlan,type Reminder} from './domain';
export function NoticeCenter({profile,plans,reminders,onAccounts,onCare}:{profile:Profile;plans:MedicationPlan[];reminders:Reminder[];onAccounts:()=>void;onCare:(residentId:string,tab:'reminders'|'medication')=>void}){
 const[open,setOpen]=useState(false),[pendingAccounts,setPendingAccounts]=useState(0);
 const manage=['owner','manager'].includes(profile.role);
 useEffect(()=>{if(!manage)return;let alive=true;async function refresh(){try{const accounts=await getAdminAccounts();if(alive)setPendingAccounts(accounts.filter(a=>a.role===null&&a.confirmed).length)}catch{if(alive)setPendingAccounts(0)}}void refresh();const timer=setInterval(()=>void refresh(),60000);return()=>{alive=false;clearInterval(timer)}},[profile.id,profile.role,manage]);
 const due=reminders.filter(r=>!r.completed_at&&!r.cancelled_at&&new Date(r.due_at).getTime()<=Date.now());
 const low=plans.filter(p=>p.active&&medicationForecast(p).lowStock);
 const count=due.length+low.length+(pendingAccounts>0?1:0);
 function navigate(action:()=>void){setOpen(false);action()}
 return <section className="notice-center"><button className="button small outline" aria-expanded={open} aria-controls="notice-list" onClick={()=>setOpen(!open)}><Bell size={19} aria-hidden="true"/> Avisos {count>0&&<span className="count">{count}</span>}</button>{open&&<div id="notice-list" className="form-panel"><h2>Lo importante, a mano</h2><p>Estos avisos se revisan con los datos autorizados del portal. No sustituyen la comunicación directa en una urgencia.</p>{count===0&&<p role="status">No hay pendientes en esta revisión.</p>}{pendingAccounts>0&&<button className="notice-item" onClick={()=>navigate(onAccounts)}><UserRoundPlus aria-hidden="true"/><span><strong>{pendingAccounts} {pendingAccounts===1?'persona lista':'personas listas'} para asignar rol</strong><small>Correo confirmado · Abrir cuentas pendientes</small></span><ArrowRight size={18}/></button>}{due.map(r=><button key={r.id} className="notice-item" onClick={()=>navigate(()=>onCare(r.resident_id,'reminders'))}><CalendarClock aria-hidden="true"/><span><strong>Cuidado pendiente de registrar</strong><small>Abrir sus recordatorios</small></span><ArrowRight size={18}/></button>)}{low.map(p=><button key={p.id} className="notice-item" onClick={()=>navigate(()=>onCare(p.resident_id,'medication'))}><Pill aria-hidden="true"/><span><strong>{p.name}: existencia baja</strong><small>{p.stock_remaining} {p.stock_unit} · Revisar reposición</small></span><ArrowRight size={18}/></button>)}</div>}</section>;
}

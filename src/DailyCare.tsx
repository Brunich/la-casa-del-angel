import {useEffect,useState} from 'react';
import {Camera,RefreshCw,ArrowRight} from 'lucide-react';
import {supabase} from './lib/api';
import {dailyCareGaps,type DailyResident} from './lib/daily-care';
import type {CareKind} from './domain';
import './daily-care.css';
export function DailyCare({onCare,onCount}:{onCare:(id:string,kind:CareKind)=>void;onCount?:(count:number)=>void}){
 const[data,setData]=useState<{day:string;residents:DailyResident[]}|null>(null),[error,setError]=useState(''),[revision,setRevision]=useState(0),[query,setQuery]=useState('');
 useEffect(()=>{let alive=true;const actor=supabase;setData(null);setError('');onCount?.(0);
  actor?.rpc('get_daily_care_status').then(({data,error})=>{if(!alive||actor!==supabase)return;if(error){setError('No se pudieron revisar los registros del día. Actualiza para intentar de nuevo.');return;}setData(data);onCount?.((data?.residents??[]).reduce((sum:number,resident:DailyResident)=>sum+dailyCareGaps(resident).length,0));});
  return()=>{alive=false};
 },[revision]);
 const rows=(data?.residents??[]).map(resident=>({resident,gaps:dailyCareGaps(resident)})).filter(row=>row.gaps.length&&row.resident.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
 return <section className="daily-care"><div className="panel-heading"><div><h2><Camera size={26}/> Fotos faltantes y cuidados del día</h2><p>{data?.day??'Hoy'} · Hora de Celaya</p></div><button className="button small outline" onClick={()=>setRevision(value=>value+1)}><RefreshCw size={16}/> Actualizar revisión</button></div>
  <p>Desayuno, comida, cena, baño y actividad. Las tomas se cuentan según la pauta diaria. Esta lista muestra lo que falta completar durante el día; sin horarios configurados, no indica retraso ni una urgencia.</p><p className="caption">Una negativa u omisión de medicamento registrada no exige foto de una toma. Sin consentimiento o con motivo documentado no se solicita foto. Una imagen no demuestra ingestión.</p>
  <label>Buscar residente<input type="search" value={query} onChange={event=>setQuery(event.target.value)}/></label>
  {error?<p role="alert" className="message error">{error}</p>:!data?<p role="status">Revisando los registros autorizados…</p>:!rows.length?<p role="status">No hay pendientes en esta consulta.</p>:<div className="daily-care-list">{rows.map(({resident,gaps})=><article key={resident.id}><h3>{resident.name}</h3><ul>{gaps.map(gap=><li key={gap.label}><button className="daily-care-gap" onClick={()=>onCare(gap.residentId,gap.kind)}><span>{gap.label}</span><ArrowRight size={17}/></button></li>)}</ul></article>)}</div>}
 </section>;
}

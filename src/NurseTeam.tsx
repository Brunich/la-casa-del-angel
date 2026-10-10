import {useEffect,useState} from 'react';
import {Building2,Stethoscope,Users} from 'lucide-react';
import {supabase} from './lib/api';
import {roleNames} from './domain';
import type {Role} from './domain';
interface Team {sites:{id:string;name:string}[];staff:{id:string;full_name:string;role:Role;site_ids:string[];resident_ids:string[];assigned_count:number}[];residents:{id:string;full_name:string;site_id:string}[]}
export function NurseTeam({userId}:{userId:string}){
 const[data,setData]=useState<Team|null>(null),[error,setError]=useState('');
 useEffect(()=>{let alive=true;void supabase?.rpc('get_my_team').then(({data,error})=>{if(!alive)return;if(error)setError('No se pudo cargar tu equipo. Actualiza o consulta a tu Manager.');else setData(data as Team)});return()=>{alive=false}},[userId]);
 return <section className="nurse-team"><h2><Users size={26} aria-hidden="true"/> Tu equipo</h2><p>Compañeros, responsables y asignaciones de tus sedes. Los expedientes conservan sus permisos individuales.</p>{error&&<p className="message error" role="alert">{error}</p>}{!data&&!error&&<p role="status">Consultando el equipo autorizado…</p>}{data&&<>{data.sites.length===0&&<p className="message">Tu Manager todavía debe asignarte una sede.</p>}{data.sites.map(site=><section className="nurse-site" key={site.id}><h3><Building2 size={21} aria-hidden="true"/> {site.name}</h3><div className="nurse-team-members">{data.staff.filter(person=>person.site_ids.includes(site.id)||person.role==='owner').map(person=><article key={person.id}><Stethoscope size={23} aria-hidden="true"/><div><h4>{person.full_name}{person.id===userId?' · Tú':''}</h4><p>{roleNames[person.role]}</p>{person.role==='nurse'&&<><p>{person.assigned_count} residentes asignados en las sedes compartidas</p><ul>{data.residents.filter(r=>r.site_id===site.id&&person.resident_ids.includes(r.id)).map(r=><li key={r.id}>{r.full_name}</li>)}</ul></>}</div></article>)}</div></section>)}</>}</section>;
}

import {useEffect,useState} from 'react';
import {Building2,HeartHandshake,LoaderCircle,Users} from 'lucide-react';
import type {Resident} from './domain';
import {getSiteAssignments,type AdminAccount} from './lib/admin-api';

interface Props {sites:{id:string;name:string}[];residents:Resident[];accounts:AdminAccount[];owner:boolean}
type Assignments = Awaited<ReturnType<typeof getSiteAssignments>>;

export function SiteTeam({sites,residents,accounts,owner}:Props){
 const[selectedSite,setSelectedSite]=useState('');
 const[data,setData]=useState<Assignments|null>(null);
 const[loading,setLoading]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0);
 useEffect(()=>{
  let alive=true;setLoading(true);setError('');setData(null);
  getSiteAssignments().then(result=>{if(alive)setData(result)}).catch(()=>{if(alive)setError('No se pudieron consultar las asignaciones. Actualiza para volver a intentar.');}).finally(()=>{if(alive)setLoading(false)});
  return()=>{alive=false};
 },[accounts,residents,sites,revision]);
 const site=sites.find(s=>s.id===selectedSite)??sites[0];
 const currentResidents=site?residents.filter(r=>r.site_id===site.id):[];
 const siteStaff=site&&data?[...new Set(data.staff.filter(a=>a.site_id===site.id).map(a=>a.user_id))]:[];
 const employees=siteStaff.map(id=>accounts.find(a=>a.id===id));
 const managers=employees.filter((a):a is AdminAccount=>a?.role==='manager');
 const nurses=employees.filter((a):a is AdminAccount=>a?.role==='nurse');
 const owners=accounts.filter(a=>a.role==='owner');
 const unknownStaff=employees.filter(a=>!a||!['owner','manager','nurse'].includes(a.role??'')).length;
 const currentIds=new Set(currentResidents.map(r=>r.id));
 const familyIds=new Set(data?.residents.filter(a=>currentIds.has(a.resident_id)&&accounts.some(p=>p.id===a.user_id&&p.role==='family')).map(a=>a.user_id));
 const staffWithoutSite=data?accounts.filter(a=>a.role&&['manager','nurse'].includes(a.role)&&!data.staff.some(link=>link.user_id===a.id)):[];
 const residentsWithoutSite=residents.filter(r=>!sites.some(s=>s.id===r.site_id));
 const chart=[{label:'Managers',value:managers.length},{label:'Enfermería',value:nurses.length},{label:'Residentes',value:currentResidents.length},{label:'Familiares autorizados',value:familyIds.size}];
 const maximum=Math.max(1,...chart.map(item=>item.value));
 function assignedResidents(account:AdminAccount){
  return currentResidents.filter(r=>data?.residents.some(link=>link.user_id===account.id&&link.resident_id===r.id));
 }
 function employeeList(people:AdminAccount[],showResidents=true){
  return <ul className="site-team-tree">{people.map(person=>{
   const linked=assignedResidents(person);
   return <li key={person.id}><strong>{person.full_name||person.email}</strong><span className="caption"> {person.email}{person.active?'':' · Cuenta inactiva'}</span>
    {showResidents&&(linked.length>0?<ul>{linked.map(r=><li key={r.id}>{r.full_name}{r.room?` · Habitación ${r.room}`:''}</li>)}</ul>:<p className="caption">Sin residentes asignados en esta sede.</p>)}
   </li>;
  })}</ul>;
 }
 return <section className="site-team form-panel" aria-labelledby="site-team-heading" aria-busy={loading}>
  <div className="panel-heading"><div><h2 id="site-team-heading"><Building2 size={22} aria-hidden="true"/> Equipo y residentes por sede</h2><p>Managers son responsables de la sede. Enfermería muestra sus residentes asignados y Familia sus accesos autorizados al expediente.</p></div><button className="button small outline" type="button" disabled={loading} onClick={()=>setRevision(r=>r+1)}>Actualizar</button></div>
  <label>{owner?'Sede':'Sede que administras'}<select value={site?.id??''} disabled={loading||sites.length===0} onChange={e=>setSelectedSite(e.target.value)}>{sites.length===0&&<option value="">Sin sedes disponibles</option>}{sites.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
  <p className="caption">{owner?'La lista incluye las sedes disponibles para Dirección general.':'La lista incluye únicamente las sedes autorizadas para tu cuenta.'} Las cantidades y vínculos corresponden a los datos disponibles en esta consulta.</p>
  {loading&&<p role="status"><LoaderCircle size={18} className="spin" aria-hidden="true"/> Consultando equipo y asignaciones…</p>}
  {error&&<p className="message error" role="alert">{error}</p>}
  {!loading&&!error&&data&&<>
   <section className="site-team-global"><h3>Dirección general · acceso global</h3><p className="caption">Dirección general administra todas las sedes; no necesitan una asignación individual.</p>{owners.length>0&&employeeList(owners,false)}</section>
   {!site?<p className="message">No hay sedes disponibles para consultar.</p>:<>
    <h3>{site.name}</h3>
    <ul className="site-team-chart" aria-label={`Cantidades en ${site.name}`}>
     {chart.map(item=><li key={item.label}><span>{item.label}</span><strong>{item.value}</strong><div className="site-team-bar" aria-hidden="true"><span style={{width:`${item.value/maximum*100}%`}}/></div></li>)}
    </ul>
    <div className="site-team-grid">
     <section className="site-team-group"><h3><Users size={20} aria-hidden="true"/> Managers responsables</h3>{managers.length?employeeList(managers,false):<p className="caption">Sin Managers asignados a esta sede.</p>}</section>
     <section className="site-team-group"><h3><HeartHandshake size={20} aria-hidden="true"/> Enfermería</h3>{nurses.length?employeeList(nurses):<p className="caption">Sin personal de enfermería asignado a esta sede.</p>}</section>
     {unknownStaff>0&&<p className="message">Hay {unknownStaff} {unknownStaff===1?'asignación de personal cuyo perfil no está disponible':'asignaciones de personal cuyos perfiles no están disponibles'} en este listado.</p>}
     <section className="site-team-group"><h3><HeartHandshake size={20} aria-hidden="true"/> Residentes y accesos familiares</h3>
      {currentResidents.length===0?<p className="caption">Sin residentes registrados en esta sede.</p>:<ul className="site-team-tree">{currentResidents.map(resident=>{
       const accessIds=[...new Set(data.residents.filter(link=>link.resident_id===resident.id).map(link=>link.user_id))];
       const family=accounts.filter(a=>a.role==='family'&&accessIds.includes(a.id));
       const unavailable=accessIds.filter(id=>!accounts.some(a=>a.id===id)).length;
       return <li key={resident.id}><strong>{resident.full_name}</strong><span className="caption">{resident.room?` · Habitación ${resident.room}`:''}{resident.active?'':' · Residente inactivo'}</span>
        {family.length>0?<ul>{family.map(person=><li key={person.id}>{person.full_name||person.email} · {person.email}{person.active?'':' · Cuenta inactiva'}</li>)}</ul>:<p className="caption">Sin familiares autorizados en este listado.</p>}
        {unavailable>0&&<p className="caption">{unavailable} {unavailable===1?'acceso con perfil fuera de este listado.':'accesos con perfiles fuera de este listado.'}</p>}
       </li>;
      })}</ul>}
     </section>
    </div>
   </>}
   <section className="site-team-unassigned"><h3>Sin asignar en el listado disponible</h3>
    {staffWithoutSite.length===0&&residentsWithoutSite.length===0?<p className="caption">No hay personal ni residentes sin sede en esta consulta.</p>:<>
     {staffWithoutSite.length>0&&<><h4>Personal sin sede asignada</h4><ul>{staffWithoutSite.map(a=><li key={a.id}>{a.full_name||a.email} · {a.email}{a.active?'':' · Cuenta inactiva'}</li>)}</ul></>}
     {residentsWithoutSite.length>0&&<><h4>Residentes sin sede disponible</h4><ul>{residentsWithoutSite.map(r=><li key={r.id}>{r.full_name}</li>)}</ul></>}
    </>}
   </section>
  </>}
 </section>;
}

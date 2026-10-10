import {useEffect,useRef,useState} from 'react';
import {Building2,HeartHandshake,Users,MapPin,ChevronRight,ArrowLeft,Camera,ClipboardList,KeyRound,Search} from 'lucide-react';
import {dateTime,kinds,type CareEvent,type Resident} from './domain';
import {getTimeline,supabase} from './lib/api';
import {PrivateCarePhoto} from './PrivateCarePhoto';
import {getSiteAssignments,type AdminAccount} from './lib/admin-api';

export type TeamView='residents'|'team'|'access';
type OpenResident=(id:string,tab?:'timeline'|'photos')=>void;
interface Props {sites:{id:string;name:string}[];residents:Resident[];accounts:AdminAccount[];owner:boolean;selectedSiteId?:string;onSelectSite?:(id:string)=>void;onResident?:OpenResident;view:TeamView;onView:(view:TeamView)=>void}
type Assignments=Awaited<ReturnType<typeof getSiteAssignments>>;

export function SiteTeam({sites,residents,accounts,owner,selectedSiteId,onSelectSite,onResident,view,onView}:Props){
 const[selectedSite,setSelectedSite]=useState(''),[selectedStaff,setSelectedStaff]=useState<AdminAccount|null>(null),[query,setQuery]=useState('');
 const[data,setData]=useState<Assignments|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0);
 const staffTrigger=useRef<string>('');
 useEffect(()=>{let alive=true;setLoading(true);setError('');setData(null);getSiteAssignments().then(result=>{if(alive)setData(result)}).catch(()=>{if(alive)setError('No se pudo consultar el equipo. Pulsa Actualizar para reintentar.');}).finally(()=>{if(alive)setLoading(false)});return()=>{alive=false};},[accounts,residents,sites,revision]);
 const site=sites.find(s=>s.id===(selectedSiteId??selectedSite));
 const currentResidents=site?residents.filter(r=>r.site_id===site.id):[];
 const siteStaff=new Set(data?.staff.filter(link=>link.site_id===site?.id).map(link=>link.user_id));
 const employees=accounts.filter(a=>siteStaff.has(a.id));
 const managers=employees.filter(a=>a.role==='manager'),nurses=employees.filter(a=>a.role==='nurse');
 const owners=accounts.filter(a=>a.role==='owner');
 const unknownStaff=[...siteStaff].filter(id=>!employees.some(a=>a.id===id&&['owner','manager','nurse'].includes(a.role??''))).length;
 const currentIds=new Set(currentResidents.map(r=>r.id));
 const familyIds=new Set(data?.residents.filter(a=>currentIds.has(a.resident_id)&&accounts.some(p=>p.id===a.user_id&&p.role==='family')).map(a=>a.user_id));
 const staffWithoutSite=data?accounts.filter(a=>a.role&&['manager','nurse'].includes(a.role)&&!data.staff.some(link=>link.user_id===a.id)):[];
 const residentsWithoutSite=residents.filter(r=>!sites.some(s=>s.id===r.site_id));
 const visible=currentResidents.filter(r=>`${r.full_name} ${r.room??''}`.toLocaleLowerCase('es').includes(query.toLocaleLowerCase('es').trim()));
 function assignedResidents(person:AdminAccount){return currentResidents.filter(r=>data?.residents.some(link=>link.user_id===person.id&&link.resident_id===r.id));}
 function chooseSite(id:string){setSelectedStaff(null);setQuery('');setSelectedSite(id);onSelectSite?.(id);}
 function chooseView(next:TeamView){setSelectedStaff(null);onView(next);}
 function closeProfile(){setSelectedStaff(null);requestAnimationFrame(()=>document.getElementById('team-person-'+staffTrigger.current)?.focus());}
 function staffRows(people:AdminAccount[]){return <ul className="team-people">{people.map(person=><li key={person.id}>
  <button className="person-open" id={'team-person-'+person.id} onClick={()=>{staffTrigger.current=person.id;setSelectedStaff(person);}}><span className="person-symbol" aria-hidden="true"><Users size={22}/></span><span><strong>{person.full_name||person.email}</strong><small>{person.role==='manager'?'Manager de la sede':`${assignedResidents(person).length} residentes asignados`}{!person.active?' · Inactivo':''}</small></span><ChevronRight size={20} aria-hidden="true"/></button>
  <details className="person-contact"><summary>Contacto y asignaciones</summary><p>{person.email}</p>{person.role==='nurse'&&(assignedResidents(person).length?<ul className="assignment-links">{assignedResidents(person).map(r=><li key={r.id}><button onClick={()=>onResident?.(r.id)}>{r.full_name}<ChevronRight size={16}/></button></li>)}</ul>:<p>Aún sin residentes asignados.</p>)}</details>
 </li>)}</ul>;}
 return <section className="site-team form-panel" aria-labelledby="site-team-heading" aria-busy={loading}>
  <div className="panel-heading"><div><h2 id="site-team-heading"><Building2 size={22} aria-hidden="true"/> Sedes y equipo</h2><p>{owner?'Elige una sede para consultar residentes, equipo y accesos.':'Todo el equipo y los residentes de tus sedes, en un solo lugar.'}</p></div><button className="button small outline" disabled={loading} onClick={()=>setRevision(r=>r+1)}>Actualizar</button></div>
  <div className={`site-colony-grid${site?' site-colony-compact':''}`} aria-label="Sedes por colonia">{sites.map(s=><button className="site-colony" key={s.id} aria-pressed={site?.id===s.id} onClick={()=>chooseSite(s.id)}><span className="site-colony-title"><MapPin size={20} aria-hidden="true"/><strong>{s.name}</strong><ChevronRight size={18} aria-hidden="true"/></span>{!site&&<span className="site-colony-counts">{residents.filter(r=>r.site_id===s.id).length} residentes</span>}</button>)}</div>
  {!sites.length&&<p className="message">{owner?'Añade una sede para organizar a tu equipo.':'Solicita a Dirección general la asignación de tu sede.'}</p>}
  {loading&&<p role="status">Consultando equipo…</p>}{error&&<p className="message error" role="alert">{error}</p>}
  {!loading&&!error&&data&&<>
   {site?<>
    <header className="site-summary"><h3>{site.name}</h3><dl><div><dt>Residentes</dt><dd>{currentResidents.length}</dd></div><div><dt>Enfermería</dt><dd>{nurses.length}</dd></div><div><dt>Managers</dt><dd>{managers.length}</dd></div><div><dt>Familiares</dt><dd>{familyIds.size}</dd></div></dl></header>
    <nav className="site-view-nav" aria-label="Apartados de la sede"><button aria-current={view==='residents'?'page':undefined} onClick={()=>chooseView('residents')}><HeartHandshake size={20}/> Residentes</button><button aria-current={view==='team'?'page':undefined} onClick={()=>chooseView('team')}><Users size={20}/> Equipo</button><button aria-current={view==='access'?'page':undefined} onClick={()=>chooseView('access')}><KeyRound size={20}/> Accesos</button></nav>
    {view==='residents'&&<section className="site-residents"><div className="directory-heading"><div><h3>Cuidados y fotografías</h3><p>Abre el expediente o ve directamente a sus fotos.</p></div><label className="directory-search"><Search size={18}/><input type="search" aria-label="Buscar residente en esta sede" placeholder="Nombre o habitación" value={query} onChange={e=>setQuery(e.target.value)}/></label></div>
     <ul className="resident-directory">{visible.map(resident=>{const links=data.residents.filter(a=>a.resident_id===resident.id);const families=accounts.filter(a=>a.role==='family'&&links.some(link=>link.user_id===a.id));const caregivers=nurses.filter(a=>links.some(link=>link.user_id===a.id));const unknown=links.filter(link=>!accounts.some(a=>a.id===link.user_id)).length;return <li key={resident.id}>
      <div className="resident-identity"><span className="person-symbol" aria-hidden="true"><HeartHandshake size={24}/></span><div><h4>{resident.full_name}</h4><p>{resident.room?`Habitación ${resident.room}`:'Sin habitación registrada'}{!resident.active?' · Inactivo':''}</p></div></div>
      <ResidentActions resident={resident} onResident={onResident}/>
      <details className="resident-connections"><summary>{caregivers.length} en enfermería · {families.length} {families.length===1?'familiar':'familiares'}</summary><p><strong>Enfermería:</strong> {caregivers.map(a=>a.full_name||a.email).join(', ')||'Sin asignación'}</p><p><strong>Familia:</strong> {families.map(a=>(a.full_name?`${a.full_name} · ${a.email}`:a.email)+(a.active?'':' (inactiva)')).join(', ')||'Sin acceso familiar'}</p>{unknown>0&&<p>{unknown} accesos con perfil fuera de este listado.</p>}</details>
     </li>;})}</ul>{!visible.length&&<p className="directory-empty">{query?'No hay coincidencias. Prueba otro nombre o habitación.':'Todavía no hay residentes en esta sede.'}</p>}
    </section>}
    {view==='team'&&(selectedStaff?<StaffActivity key={selectedStaff.id+site.id} person={selectedStaff} residents={selectedStaff.role==='manager'?currentResidents:assignedResidents(selectedStaff)} onResident={onResident} onClose={closeProfile}/>:<div className="team-directory"><section><h3><Users size={20}/> Managers</h3><p>Responsables de la sede.</p>{managers.length?staffRows(managers):<p className="directory-empty">Aún sin Manager asignado.</p>}</section><section><h3><HeartHandshake size={20}/> Enfermería</h3><p>Abre una ficha para ver asignaciones y publicaciones.</p>{nurses.length?staffRows(nurses):<p className="directory-empty">Aún sin personal de enfermería.</p>}</section>{unknownStaff>0&&<p>{unknownStaff} asignaciones con perfil no disponible.</p>}</div>)}
   </>:<p className="directory-empty">Selecciona una sede para abrir sus residentes y su equipo.</p>}
   {(!site||view==='team')&&<div className="team-extra"><details><summary>Dirección general · {owners.length}</summary><ul>{owners.map(person=><li key={person.id}><strong>{person.full_name||person.email}</strong><span>{person.email}{person.active?'':' · Cuenta inactiva'}</span></li>)}</ul></details><details><summary>Sin sede asignada · {staffWithoutSite.length+residentsWithoutSite.length}</summary>{!staffWithoutSite.length&&!residentsWithoutSite.length?<p>Todos tienen una sede en esta consulta.</p>:<ul>{staffWithoutSite.map(a=><li key={a.id}>{a.full_name||a.email} · {a.email}</li>)}{residentsWithoutSite.map(r=><li key={r.id}>{r.full_name}</li>)}</ul>}</details></div>}
  </>}
 </section>;
}

function ResidentActions({resident,onResident}:{resident:Resident;onResident?:OpenResident}){return <div className="resident-destinations"><button onClick={()=>onResident?.(resident.id)} aria-label={`Cuidados de ${resident.full_name}`}><ClipboardList size={18}/> Cuidados<ChevronRight size={16}/></button><button className="photo-destination" onClick={()=>onResident?.(resident.id,'photos')} aria-label={`Fotos de ${resident.full_name}`}><Camera size={18}/> Fotos<ChevronRight size={16}/></button></div>;}

function StaffActivity({person,residents,onResident,onClose}:{person:AdminAccount;residents:Resident[];onResident?:OpenResident;onClose:()=>void}){
 const[events,setEvents]=useState<CareEvent[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 const heading=useRef<HTMLHeadingElement>(null);
 useEffect(()=>{heading.current?.focus();},[]);
 useEffect(()=>{let alive=true;const actor=supabase;void(async()=>{try{const result:CareEvent[]=[];for(let offset=0;offset<residents.length;offset+=4){const rows=await Promise.all(residents.slice(offset,offset+4).map(resident=>getTimeline(resident.id)));if(!alive||actor!==supabase)return;result.push(...rows.flat().filter(event=>event.actor_id===person.id));}if(alive)setEvents(result.sort((a,b)=>Date.parse(b.occurred_at)-Date.parse(a.occurred_at)));}catch{if(alive)setError('No se pudo consultar la actividad. Vuelve al equipo y abre la ficha otra vez.');}finally{if(alive)setLoading(false);}})();return()=>{alive=false};},[person.id,residents]);
 return <section className="team-activity"><button className="team-back" onClick={onClose}><ArrowLeft size={18}/> Volver al equipo</button><header><h3 ref={heading} tabIndex={-1}>{person.full_name||person.email}</h3><p>{person.role==='nurse'?'Enfermería':'Manager'} · {person.email}</p></header><h4>Residentes {person.role==='nurse'?'asignados':'de la sede'}</h4><ul className="profile-residents">{residents.map(r=><li key={r.id}><strong>{r.full_name}</strong><ResidentActions resident={r} onResident={onResident}/></li>)}</ul><h4>Últimas publicaciones</h4>{loading?<p role="status">Consultando actividad…</p>:error?<p role="alert" className="message error">{error}</p>:!events.length?<p>Todavía no hay publicaciones en los residentes de esta sede.</p>:events.map(event=><article className="timeline-event" key={event.id}><div><h4>{kinds[event.kind]} · {residents.find(r=>r.id===event.resident_id)?.full_name}</h4><p>{dateTime(event.occurred_at)}</p>{event.notes&&<p>{event.notes}</p>}{event.photo_path&&<PrivateCarePhoto path={event.photo_path} caption={kinds[event.kind]+' · '+dateTime(event.occurred_at)}/>}<button className="team-back" onClick={()=>onResident?.(event.resident_id)}>Abrir expediente<ChevronRight size={18}/></button></div></article>)}</section>;
}

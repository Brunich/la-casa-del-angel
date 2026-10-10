import {isAppDisplay} from './lib/app-display';
import {useState,useEffect,useRef,useMemo,type FormEvent} from 'react';
import {LoadingScreen} from './LoadingScreen';
import {BrandNavigation} from './BrandNavigation';
import {ThemeToggle} from './ThemeToggle';
import {PortalHelp} from './PortalHelp';
import {NurseTeam} from './NurseTeam';
import './portal-workspace.css';
import './portal-sections.css';
import {HeartHandshake,LogOut,RefreshCw,Bell,Plus,Search,ClipboardList,Pill,CalendarClock,Image as ImageIcon,Check,ArrowUpRight,Users,House,Building2,Stethoscope,UserPlus,KeyRound,CircleHelp,TriangleAlert} from 'lucide-react';
import {CareForm} from './CareForm';
import {DailyCare} from './DailyCare';
import {PrivateCarePhoto} from './PrivateCarePhoto';
import {selectCareHistory,type HistoryView} from './lib/care-history';
import {photoWindow} from './lib/photo-window';
import {MFA} from './MFA';
import {AdminAccess,type AdminSection} from './AdminAccess';
import {RoleOverview} from './RoleOverview';
import {NoticeCenter} from './NoticeCenter';
import {needsInitialMfa} from './lib/initial-mfa';
import {SelectionGate} from './lib/selection';
import {filterResidents} from './lib/resident-search';
import {MedicationPanel} from './MedicationPanel';
import {kinds,dateTime,roleNames,pendingReminders,type Profile,type Resident,type CareEvent,type MedicationPlan,type Reminder,type CareKind,type MedicationMovement} from './domain';
import {supabase,ownerSupabase,getProfile,getResidents,getTimeline,getMedications,getReminders,addReminder,getSites,addResident,getAccessibleMedications,getMovements,cancelReminder} from './lib/api';
import {enableNotifications,syncDeviceNotifications,clearDeviceNotifications,isNative} from './lib/notifications';
export function Portal({onLogout,onReturnToOwner}:{onLogout:()=>void;onReturnToOwner?:()=>void}){
 const portalClient=useRef(supabase).current;
 const[profile,setProfile]=useState<Profile|null>(null),[residents,setResidents]=useState<Resident[]>([]),[selected,setSelected]=useState(''),[events,setEvents]=useState<CareEvent[]>([]),[plans,setPlans]=useState<MedicationPlan[]>([]),[reminders,setReminders]=useState<Reminder[]>([]),[tab,setTab]=useState<'timeline'|'medication'|'reminders'|'photos'|'incidents'|'missing'>('timeline'),[form,setForm]=useState<CareKind|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[message,setMessage]=useState(''),[query,setQuery]=useState(''),[notify,setNotify]=useState(false),[create,setCreate]=useState(false),[sites,setSites]=useState<{id:string;name:string}[]>([]);
 const[notificationPlans,setNotificationPlans]=useState<MedicationPlan[]>([]),[movements,setMovements]=useState<MedicationMovement[]>([]);
 const sequence=useRef(0),selection=useRef(new SelectionGate());
 const[needsMfa,setNeedsMfa]=useState(false),[adminOpen,setAdminOpen]=useState(false);
 const[adminSection,setAdminSection]=useState<AdminSection>('pending');
 const[pendingApproval,setPendingApproval]=useState(false);
 const[workspace,setWorkspace]=useState<'home'|'care'|'admin'|'new-resident'|'team'|'help'>('home'),[nurseMode,setNurseMode]=useState(false),[navigationRevision,setNavigationRevision]=useState(0);
 const resident=residents.find(r=>r.id===selected);
 const visibleResidents=filterResidents(residents,query);
 const canWrite=!!profile&&['owner','manager','nurse'].includes(profile.role),canManage=!!profile&&['owner','manager'].includes(profile.role);
 const viewRole=profile?.role==='owner'&&nurseMode?'nurse':profile?.role;
 function navigate(next:typeof workspace){setWorkspace(next);setAdminOpen(next==='admin');setCreate(next==='new-resident');setForm(null);setNavigationRevision(r=>r+1);requestAnimationFrame(()=>{document.querySelector('#contenido')?.scrollIntoView({block:'start'});document.querySelector<HTMLElement>('.portal-header h1')?.focus({preventScroll:true});});}
 function openAdmin(section:AdminSection){setAdminSection(section==='roles'?'staff':section);navigate('admin');}
 function openCare(nextTab:typeof tab='timeline'){setTab(nextTab);navigate('care');}
 function chooseResident(id:string){sequence.current++;selection.current.select(id);setSelected(id);setAdminOpen(false);setWorkspace('care');}
 const menuItems=[
  {id:'home',label:'Inicio de mi portal',icon:House,onSelect:()=>navigate('home')},
  ...(viewRole==='owner'||viewRole==='manager'?[
   {id:'staff',label:'Sedes y equipo',icon:Building2,onSelect:()=>openAdmin('staff')},
   {id:'pending',label:'Dar de alta cuenta nueva, pendiente',icon:UserPlus,onSelect:()=>openAdmin('pending')},
   {id:'residents',label:'Dar acceso familia a residente',icon:KeyRound,onSelect:()=>openAdmin('residents')},
   {id:'new-resident',label:'Registrar residente',icon:Plus,onSelect:()=>navigate('new-resident')},
  ]:[]),
  ...(viewRole?[{id:'care',label:viewRole==='family'?'Mi familiar · bitácora':'Bitácora de cuidados',icon:ClipboardList,onSelect:()=>openCare('timeline')},
   {id:'medication',label:'Medicamentos',icon:Pill,onSelect:()=>openCare('medication')},
   {id:'photos',label:'Fotografías',icon:ImageIcon,onSelect:()=>openCare('photos')},
   {id:'incidents',label:'Incidentes y atención',icon:TriangleAlert,onSelect:()=>openCare('incidents')}]:[]),
  ...(viewRole==='nurse'?[{id:'team',label:'Equipo y compañeros',icon:Users,onSelect:()=>navigate('team')}]:[]),
  ...(canWrite?[{id:'reminders',label:'Mis recordatorios',icon:CalendarClock,onSelect:()=>openCare('reminders')}]:[]),
  ...(profile?.role==='owner'?[{id:'nurse-mode',label:nurseMode?'Volver a Dirección general':'Modo enfermería',icon:Stethoscope,onSelect:()=>{setNurseMode(v=>!v);navigate(nurseMode?'home':'care');}}]:[]),
  ...(canWrite?[{id:'missing',label:'Fotos faltantes · Hoy',icon:ImageIcon,onSelect:()=>openCare('missing')}]:[]),
  {id:'help',label:'Preguntas del portal',icon:CircleHelp,onSelect:()=>navigate('help')},
  ...(onReturnToOwner?[{id:'return-owner',label:'Volver a Dirección general',icon:House,onSelect:onReturnToOwner}]:[]),
  {id:'logout',label:'Cerrar sesión',icon:LogOut,onSelect:()=>void logout()},
 ];
 async function init(quiet=false){
  const ticket=selection.current.capture();if(!quiet)setLoading(true);setError('');setPendingApproval(false);
  try{
   const p=await getProfile();if(!selection.current.isCurrent(ticket))return;setProfile(p);
   if(['owner','manager','nurse'].includes(p.role)){
    const{data,error:mfaError}=await portalClient!.auth.mfa.listFactors();
    if(!selection.current.isCurrent(ticket)||supabase!==portalClient)return;
    if(mfaError)throw new Error('No se pudo verificar la seguridad de tu cuenta.');
    if(needsInitialMfa(p.role,data.totp)){setNeedsMfa(true);return;}
   }
   const[list,siteList,items,allPlans]=await Promise.all([getResidents(),['owner','manager'].includes(p.role)?getSites():Promise.resolve([]),getReminders(),getAccessibleMedications()]);
   if(!selection.current.isCurrent(ticket))return;
   setNeedsMfa(false);setResidents(list);setSites(siteList);setReminders(items);setNotificationPlans(allPlans);
   const next=list.some(r=>r.id===selection.current.current)?selection.current.current:(list[0]?.id??'');selection.current.select(next);setSelected(next);
  }catch(err){
   if(selection.current.isCurrent(ticket)){
    const pending=typeof err==='object'&&err!==null&&'code' in err&&err.code==='CARE_PROFILE_PENDING';
    setPendingApproval(pending);setProfile(null);sequence.current++;selection.current.invalidate();setForm(null);
    setError(pending?'':(err as Error).message);setResidents([]);setEvents([]);setPlans([]);setMovements([]);setNotificationPlans([]);setReminders([]);
    await clearDeviceNotifications().catch(()=>setMessage('No se pudieron cancelar los avisos del dispositivo. Revísalos en ajustes.'));setNotify(false);
   }
  }finally{if(!quiet)setLoading(false)}
 }
 async function load(id=selection.current.current){if(!id||id!==selection.current.current)return;const ticket=selection.current.capture();const token=++sequence.current;setLoading(true);setError('');setEvents([]);setPlans([]);setMovements([]);try{const p=await getProfile();if(token!==sequence.current||!selection.current.isCurrent(ticket)||supabase!==portalClient)return;if(p.id!==profile?.id||p.role!==profile?.role){await logout();return;}const[timeline,medications,items,allPlans,history]=await Promise.all([getTimeline(id),getMedications(id),getReminders(),getAccessibleMedications(),getMovements(id)]);if(token!==sequence.current||!selection.current.isCurrent(ticket))return;setEvents(timeline.sort((a,b)=>new Date(b.occurred_at).getTime()-new Date(a.occurred_at).getTime()));setPlans(medications);setReminders(items);setNotificationPlans(allPlans);setMovements(history);}catch(err){if(token===sequence.current&&selection.current.isCurrent(ticket)){sequence.current++;selection.current.invalidate();setLoading(false);setForm(null);setError((err as Error).message);setReminders([]);setNotificationPlans([]);setResidents([]);setPlans([]);setEvents([]);await clearDeviceNotifications().catch(()=>setMessage('No se pudieron cancelar los avisos del dispositivo. Revísalos en ajustes.'));setNotify(false);}}finally{if(token===sequence.current&&selection.current.isCurrent(ticket))setLoading(false)}}
 useEffect(()=>{void init();return()=>{sequence.current++;selection.current.invalidate()}},[]);
 useEffect(()=>{if(profile){setWorkspace(['owner','manager'].includes(profile.role)?'home':'care');setNurseMode(false);setAdminOpen(false);setCreate(false)}},[profile?.id,profile?.role]);
 useEffect(()=>{if(form)setMessage('');},[form]);
 useEffect(()=>{setForm(null);setMessage('');if(selected)void load(selected);else{setEvents([]);setPlans([]);setMovements([]);}},[selected]);
 useEffect(()=>{if(!notify)return;void syncDeviceNotifications(reminders,notificationPlans).catch(err=>setMessage((err as Error).message));},[notify,reminders,notificationPlans]);
 useEffect(()=>{if(!profile||needsMfa)return;let active=true;let updating=false;async function refresh(){if(updating||document.hidden)return;const refreshTicket=selection.current.capture();updating=true;try{const p=await getProfile();if(!active||!selection.current.isCurrent(refreshTicket))return;if(p.id!==profile?.id||p.role!==profile?.role){await logout();return;}const[list,items,allPlans]=await Promise.all([getResidents(),getReminders(),getAccessibleMedications()]);if(!active||!selection.current.isCurrent(refreshTicket))return;setResidents(list);setReminders(items);setNotificationPlans(allPlans);if(selection.current.current&&!list.some(r=>r.id===selection.current.current)){selection.current.select('');setSelected('');setEvents([]);setPlans([]);setMovements([]);}}catch{if(active&&selection.current.isCurrent(refreshTicket)){sequence.current++;selection.current.invalidate();setLoading(false);setForm(null);setResidents([]);setEvents([]);setPlans([]);setMovements([]);setNotificationPlans([]);setReminders([]);setError('No se pudo verificar tu acceso. Actualiza o inicia sesión de nuevo.');await clearDeviceNotifications().catch(()=>setMessage('No se pudieron cancelar los avisos del dispositivo. Revísalos en ajustes.'));setNotify(false);}}finally{updating=false}}const interval=setInterval(()=>void refresh(),60000);const visibility=()=>{if(!document.hidden)void refresh()};document.addEventListener('visibilitychange',visibility);return()=>{active=false;clearInterval(interval);document.removeEventListener('visibilitychange',visibility)}},[profile,needsMfa,form]);
 async function activate(){try{await enableNotifications();setNotify(true);setMessage(isNative()?'Avisos activados en este dispositivo.':'Avisos activados mientras esta página esté abierta.')}catch(err){setMessage((err as Error).message)}}
 async function logout(){if(supabase!==portalClient)return;sequence.current++;selection.current.invalidate();await clearDeviceNotifications().catch(()=>setMessage('Revisa los avisos del dispositivo en ajustes.'));if(supabase!==portalClient)return;await portalClient?.auth.signOut(portalClient===ownerSupabase?undefined:{scope:'local'});if(supabase!==portalClient)return;onLogout();}
 async function createResident(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);setError('');try{await addResident({full_name:String(f.get('name')),site_id:String(f.get('site')),room:String(f.get('room')),active:true,photo_consent:f.get('consent')==='on'});navigate('home');await init();}catch(err){setError((err as Error).message)}}
 const viewTicket=selection.current.capture();
 if(loading)return <LoadingScreen title={profile?'Actualizando tu espacio':'Preparando tu acceso'} message={profile?'Consultando la información autorizada.':'Comprobando tu cuenta y los permisos del portal.'}/>;
 if(pendingApproval)return <div className={`portal-shell pending-portal${isAppDisplay()?' app-native':''}`}><aside className="portal-sidebar"><BrandNavigation compact items={[{id:'home',label:'Estado de mi cuenta',icon:House,onSelect:()=>navigate('home')},...(canWrite?[{id:'missing',label:'Fotos faltantes · Hoy',icon:ImageIcon,onSelect:()=>openCare('missing')}]:[]),
  {id:'help',label:'Preguntas del portal',icon:CircleHelp,onSelect:()=>navigate('help')}]}/><div className="sidebar-bottom"><button className="text-link" onClick={()=>void logout()}><LogOut size={17}/> Cerrar sesión</button></div></aside><main id="contenido" className="portal-main"><header className="portal-header"><div><h1 tabIndex={-1}>Mi cuenta</h1><p>Correo confirmado · Acceso pendiente de asignación</p></div><ThemeToggle/></header>{workspace==='help'?<PortalHelp role={null}/>:<section className="pending-account"><HeartHandshake size={38} aria-hidden="true"/><h2>Rol pendiente</h2><p className="message" role="status">Ya estás dentro del portal. Un Manager o Dirección general debe confirmar tu rol y asignarte los accesos correspondientes.</p><p>Mientras se revisa tu cuenta, no hay expedientes ni fotografías disponibles. Si elegiste una sede, su Manager revisará la solicitud; las solicitudes sin sede las revisa Dirección general.</p><button type="button" className="button" onClick={()=>void init()}>Comprobar mi autorización</button></section>}</main></div>;
 if(needsMfa)return <MFA onVerified={()=>void init()} onLogout={()=>void logout()}/>;
 return <div className={`portal-shell${isAppDisplay()?' app-native':''}`}><aside className="portal-sidebar"><BrandNavigation compact role={viewRole} items={menuItems} activeItem={workspace==='admin'?adminSection:workspace==='care'?(tab==='timeline'?'care':tab):workspace}/><p className="sidebar-label">{profile?.full_name}</p>
 {residents.length>0&&<>
 <label className="resident-search-label" htmlFor="resident-search">Buscar por nombre o habitación</label><div className="search-field"><Search size={20} aria-hidden="true"/><input id="resident-search" type="search" placeholder="Nombre o habitación" value={query} onChange={e=>setQuery(e.target.value)}/></div>
 <label className="resident-picker">Residente<select value={selected} onChange={event=>chooseResident(event.target.value)}><option value="" disabled>Elige un residente</option>{resident&&!visibleResidents.some(r=>r.id===resident.id)&&<option value={resident.id}>{resident.full_name} · seleccionado</option>}{visibleResidents.map(r=><option value={r.id} key={r.id}>{r.full_name}{r.room?' · '+r.room:''}</option>)}</select></label>
 <nav className="resident-list" aria-label="Residentes">{visibleResidents.map(r=><button aria-current={r.id===selected?'true':undefined} className={r.id===selected?'resident-button selected':'resident-button'} key={r.id} onClick={()=>chooseResident(r.id)}><span className="avatar" aria-hidden="true">{r.full_name.split(' ').filter(Boolean).slice(0,2).map(n=>n[0]).join('')}</span><span>{r.full_name}<small>{r.room?'Habitación '+r.room:'Residente'}</small></span></button>)}</nav>
 {residents.length>0&&visibleResidents.length===0&&<p className="resident-search-empty" role="status">No hay residentes que coincidan. Prueba otro nombre o habitación.</p>}
 {resident&&<a href="#contenido" className="text-link resident-jump">Ir al expediente seleccionado</a>}
 </>}
 {resident&&<nav className="resident-shortcuts" aria-label="Acceso directo al residente"><button onClick={()=>openCare('timeline')}><ClipboardList size={18}/> Cuidados</button><button onClick={()=>openCare('photos')}><ImageIcon size={18}/> Fotos</button></nav>}
 <div className="sidebar-bottom"><button className="text-link" onClick={()=>void logout()}><LogOut size={17}/> Cerrar sesión</button><a href={isAppDisplay()?"/residencia":"/"} className="text-link">Conoce la residencia <ArrowUpRight size={15}/></a></div></aside>
 <main id="contenido" className="portal-main" data-section={adminOpen?'administration':tab}><header className="portal-header workspace-header"><div><h1 tabIndex={-1}>{workspace==='care'&&resident?resident.full_name:viewRole?roleNames[viewRole]:'Mi portal'}</h1><p>{workspace==='care'?(nurseMode?'Modo enfermería · Acceso de Dirección general':canWrite?'Registra cuidados del turno y revisa los pendientes.':'Consulta los cuidados de tu familiar.'):workspace==='admin'?'Organiza personas, sedes y accesos.':workspace==='new-resident'?'Registra al residente en su sede.':workspace==='team'?'Consulta tus compañeros y responsables.':workspace==='help'?'Resuelve dudas sobre tu cuenta y sus permisos.':viewRole==='owner'?'Supervisa tus sedes y organiza el acceso de cada persona.':'Organiza el cuidado y las personas de tus sedes.'}</p></div><div className="workspace-tools"><ThemeToggle/><button className="compact-tool refresh-tool" aria-label="Refresh · Actualizar información" disabled={loading} onClick={()=>workspace==='care'&&selected?void load():void init()}><RefreshCw size={17} aria-hidden="true"/><small>Refresh</small></button>{profile&&!error&&<NoticeCenter profile={profile} plans={notificationPlans} reminders={reminders} onActivate={()=>void activate()} notificationsActive={notify} onAccounts={()=>openAdmin('pending')} onCare={(id,nextTab)=>{if(!residents.some(r=>r.id===id))return;sequence.current++;selection.current.select(id);setSelected(id);openCare(nextTab)}}/>}</div></header>
 {profile&&!error&&workspace==='home'&&<RoleOverview role={viewRole!} sitesCount={sites.length} residentsCount={residents.length} onAdminSection={canManage?openAdmin:undefined} onCare={()=>openCare()} onCreate={()=>navigate('new-resident')}/>}
 {workspace==='help'&&<PortalHelp role={profile?.role??null}/>}
 {workspace==='team'&&!error&&profile&&viewRole==='nurse'&&<NurseTeam userId={profile.id}/>}
 {message&&<p className="message" role="status">{message}</p>}{error&&<p className="message error" role="alert">{error}</p>}
 {create&&!error&&canManage&&<section className="form-panel"><h2>Nuevo residente</h2><form onSubmit={createResident}><div className="field-grid"><label>Nombre completo<input name="name" required maxLength={160}/></label><label>Sede<select name="site" required><option value="">Seleccionar sede</option>{sites.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>Habitación<input name="room" maxLength={50}/></label></div><label className="checkbox"><input type="checkbox" name="consent"/> Existe autorización documentada para fotografías de cuidados</label><p className="caption">Verifica identidad, representación y consentimientos antes de activar acceso familiar.</p><div className="actions"><button className="button">Registrar residente</button><button type="button" className="button outline" onClick={()=>navigate('home')}>Cancelar</button></div></form></section>}
 {adminOpen&&!error&&canManage&&profile&&<AdminAccess key={navigationRevision} profile={profile} residents={residents} sites={sites} initialSection={adminSection} onUpdated={()=>void init(true)} onResident={(id,nextTab)=>{chooseResident(id);openCare(nextTab);}}/>}
 {workspace==='care'&&tab==='missing'&&!error&&canWrite&&<DailyCare onCare={(id,kind)=>{chooseResident(id);openCare(kind==='medication'?'medication':'timeline');}}/>}
 {workspace==='care'&&tab!=='missing'&&!error&&(!resident?<div className="empty"><Users size={38}/><h2>{canManage?'Todavía no hay residentes disponibles':'Aún no tienes residentes asignados'}</h2><p>{canManage?'Las sedes ya están disponibles. Registra al primer residente desde el menú del portal.':'Un Manager debe vincular tu cuenta a los expedientes autorizados.'}</p></div>:form?<CareForm key={resident.id+form} resident={resident} profile={profile!} plans={plans} initialKind={form} onCancel={()=>{if(!selection.current.isCurrent(viewTicket))return;setForm(null);void load();}} onSaved={()=>{if(!selection.current.isCurrent(viewTicket))return;setForm(null);setMessage('Cuidado registrado correctamente.');void load();}}/>:<>
 {canWrite&&tab==='timeline'&&<section className="quick-care"><h2>Registrar un cuidado</h2><div>{Object.entries(kinds).map(([value,label])=><button key={value} onClick={()=>setForm(value as CareKind)}><Plus size={17}/>{label}</button>)}</div></section>}
 <nav className="portal-tabs" aria-label="Expediente"><button aria-current={tab==='timeline'?'page':undefined} className={tab==='timeline'?'active':''} onClick={()=>setTab('timeline')}><ClipboardList size={18}/> Bitácora</button><button aria-current={tab==='medication'?'page':undefined} className={tab==='medication'?'active':''} onClick={()=>setTab('medication')}><Pill size={18}/> Medicamentos</button><button aria-current={tab==='photos'?'page':undefined} className={tab==='photos'?'active':''} onClick={()=>setTab('photos')}><ImageIcon size={18}/> Fotografías</button><button aria-current={tab==='incidents'?'page':undefined} className={tab==='incidents'?'active':''} onClick={()=>setTab('incidents')}><TriangleAlert size={18}/> Incidentes</button>{canWrite&&<button aria-current={tab==='reminders'?'page':undefined} className={tab==='reminders'?'active':''} onClick={()=>setTab('reminders')}><CalendarClock size={18}/> Recordatorios {pendingReminders(reminders.filter(r=>r.resident_id===selected)).length>0&&<span className="count">{pendingReminders(reminders.filter(r=>r.resident_id===selected)).length}</span>}</button>}</nav>
 {tab==='timeline'&&<Timeline key={resident.id} events={events}/>}
 {tab==='photos'&&<PhotoArchive key={resident.id} events={events}/> }
 {tab==='incidents'&&<section className="incident-workspace"><div className="incident-summary"><TriangleAlert size={34} aria-hidden="true"/><div><h2>Incidentes y atención</h2><p>Consulta qué ocurrió, quién atendió al residente y qué seguimiento quedó registrado.</p><p className="caption">Incidentes en los registros cargados de este residente: {events.filter(event=>event.kind==='incident').length}.</p></div>{canWrite&&<button type="button" className="button" onClick={()=>setForm('incident')}><Plus size={18}/> Registrar incidente</button>}</div><Timeline key={resident.id} events={events} view="incidents"/></section>}
 {tab==='medication'&&<MedicationPanel key={resident.id} plans={plans} movements={movements} residentId={resident.id} canManage={canManage&&!nurseMode} onUpdated={()=>{if(selection.current.isCurrent(viewTicket))void load();}}/>}
 {tab==='reminders'&&canWrite&&<Reminders key={resident.id} resident={resident} plans={plans} profile={profile!} reminders={reminders.filter(r=>r.resident_id===selected)} onUpdated={()=>{if(selection.current.isCurrent(viewTicket))void load();}}/>}
 </>)}
 <footer className="portal-footer"><a href="/privacidad">Privacidad</a><a href="/terminos">Términos de uso</a><span>Información privada · No compartas tu cuenta</span></footer></main></div>;
}
function Timeline({events,view='care'}:{events:CareEvent[];view?:HistoryView}){
 const[filter,setFilter]=useState('all'),[limit,setLimit]=useState(20);
 useEffect(()=>{setLimit(20)},[events,filter,view]);
 const matching=selectCareHistory(events,view,filter),visible=matching.slice(0,limit);
 const detailLabels:Record<string,string>={meal:'Comida',intake:'Consumo',activity:'Actividad',minutes:'Minutos',medication_name:'Medicamento',dose_amount:'Cantidad',dose_unit:'Unidad',inventory_units:'Unidades de existencia',stock_unit:'Unidad de existencia',incident_type:'Incidente',handled_by:'Atendido por',actions:'Atención',follow_up:'Seguimiento',no_photo_reason:'Motivo sin foto',photo_omission_reason:'Motivo sin foto',recorded_by:'Registrado por'};
 const translate:Record<string,string>={administered:'Administrado',refused:'Rechazado',omitted:'Omitido',vomiting:'Vómito',fall:'Caída',pain:'Dolor',fever:'Fiebre',other:'Otro'};
 return <section>
  {view!=='incidents'&&<div className="panel-heading"><div><h2>{view==='photos'?'Fotografías de los cuidados':'La historia de sus cuidados'}</h2><p>{view==='photos'?'Las imágenes se muestran aquí; pulsa una para verla completa.':'Cada registro conserva la hora y la persona responsable. Los incidentes tienen su propia sección.'}</p></div><select aria-label="Filtrar bitácora" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">{view==='photos'?'Todas las fotografías':'Todos los cuidados'}</option>{Object.entries(kinds).filter(([kind])=>view==='photos'||kind!=='incident').map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></div>}
  {visible.length===0?<div className="empty">{view==='incidents'?<TriangleAlert size={34}/>:<ClipboardList size={34}/>}<h3>{view==='incidents'?'Sin incidentes registrados':'Aún no hay registros en esta vista'}</h3><p>Los registros aparecerán aquí cuando el equipo los guarde.</p></div>:<div className="timeline">{visible.map(event=><article className="timeline-event" key={event.id}>
   <div className={'event-dot '+event.kind}>{event.kind==='incident'?<TriangleAlert size={17}/>:<Check size={17}/>}</div><div>
    <div className="event-heading"><h3>{kinds[event.kind]}</h3><time dateTime={event.occurred_at}>{dateTime(event.occurred_at)}</time></div>
    {event.kind==='medication'&&Boolean(event.details.status)&&<span className="status">{translate[String(event.details.status)]??String(event.details.status)}</span>}
    {event.notes&&<p>{event.notes}</p>}
    <dl className="event-details">{Object.entries(event.details).filter(([key,value])=>detailLabels[key]&&(key!=='handled_by'||event.kind==='incident')&&value!==null&&value!=='').map(([key,value])=><div key={key}><dt>{detailLabels[key]}</dt><dd>{translate[String(value)]??String(value)}</dd></div>)}</dl>
    {event.photo_path&&<PrivateCarePhoto path={event.photo_path} caption={kinds[event.kind]+' · '+dateTime(event.occurred_at)}/>}
    <p className="caption">Registro recibido: {dateTime(event.recorded_at)}</p>
   </div>
  </article>)}</div>}
  {matching.length>20&&<div className="history-pagination"><p>Mostrando {visible.length} de {matching.length} registros cargados.</p>{limit<matching.length&&<button type="button" className="button outline" onClick={()=>setLimit(value=>value+20)}>Mostrar 20 más</button>}</div>}
 </section>;
}
function PhotoArchive({events}:{events:CareEvent[]}){
 const[period,setPeriod]=useState<'recent'|'archived'>('recent');const photos=useMemo(()=>photoWindow(events),[events]);const visible=photos[period];
 return <section><div className="panel-heading"><div><h2>Fotografías del huésped</h2><p>Las fotos de la última semana, a mano. Las anteriores se conservan en el archivo.</p></div><label>Periodo<select value={period} onChange={e=>setPeriod(e.target.value as 'recent'|'archived')}><option value="recent">Últimos 7 días ({photos.recent.length})</option><option value="archived">Archivo anterior ({photos.archived.length})</option></select></label></div>{visible.length?<Timeline key={period} events={visible} view="photos"/>:<div className="empty"><ImageIcon size={34}/><h3>No hay fotografías en este periodo</h3><p>Selecciona otro periodo o espera a que el equipo registre un cuidado con fotografía.</p></div>}</section>;
}
function Reminders({resident,plans,profile,reminders,onUpdated}:{resident:Resident;plans:MedicationPlan[];profile:Profile;reminders:Reminder[];onUpdated:()=>void}){
 const[kind,setKind]=useState<CareKind>('bath'),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function cancel(id:string){setError('');setBusy(true);try{await cancelReminder(id);onUpdated();}catch(err){setError((err as Error).message)}finally{setBusy(false)}}
 async function save(e:FormEvent<HTMLFormElement>){e.preventDefault();const element=e.currentTarget;const f=new FormData(element);setBusy(true);setError('');try{const date=new Date(String(f.get('due')));if(date.getTime()<=Date.now())throw new Error('Elige una fecha futura.');await addReminder({resident_id:resident.id,kind,due_at:date.toISOString(),user_id:profile.id,medication_plan_id:kind==='medication'?String(f.get('plan')):null});onUpdated();element.reset();}catch(err){setError((err as Error).message)}finally{setBusy(false)}}
 return <section><h2>Que ningún cuidado se nos pase</h2><p>Programa tus recordatorios para este residente. Se completan cuando queda registrado el cuidado correspondiente.</p><form className="reminder-form" onSubmit={save}><label>Cuidado<select value={kind} onChange={e=>setKind(e.target.value as CareKind)}>{Object.entries(kinds).filter(([v])=>v!=='incident').map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>{kind==='medication'&&<label>Medicamento<select name="plan" required><option value="">Seleccionar</option>{plans.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}<label>Cuándo avisarte<input type="datetime-local" name="due" required/></label><button className="button" disabled={busy}><Bell size={17}/>{busy?'Guardando…':'Crear recordatorio'}</button></form>{error&&<p role="alert" className="message error">{error}</p>}<p className="caption">{isNative()?'Los avisos del dispositivo usan la información de tu última actualización. Abre la app para sincronizar cambios.':'En la web, los avisos se muestran con esta página abierta y con tu permiso. Los pendientes permanecen en el portal.'}</p><div className="reminder-list">{reminders.length===0?<div className="empty"><CalendarClock size={30}/><h3>Sin recordatorios todavía</h3><p>Empieza con el próximo cuidado del turno.</p></div>:reminders.map(r=><article key={r.id}><CalendarClock size={21}/><div><strong>{kinds[r.kind]}</strong><p>{dateTime(r.due_at)}</p></div><span className={r.completed_at?'status':'status warning'}>{r.cancelled_at?'Cancelado':r.completed_at?'Registrado':new Date(r.due_at).getTime()<=Date.now()?'Pendiente':'Programado'}</span>{!r.completed_at&&!r.cancelled_at&&<button className="text-link" disabled={busy} onClick={()=>void cancel(r.id)}>Cancelar</button>}</article>)}</div></section>;
}

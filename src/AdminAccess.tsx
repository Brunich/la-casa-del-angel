import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Building2,HeartHandshake,KeyRound,LoaderCircle,UserPlus,Users,UserRoundCog,UserRoundMinus} from 'lucide-react';
import {ManagerOnboarding} from './ManagerOnboarding';
import {SiteTeam} from './SiteTeam';
import {InviteAccountForm} from './InviteAccountForm';
import {roleNames,type Profile,type Resident,type Role} from './domain';
import {assignNurseSector,createSite,getAdminAccounts,getSiteAssignments,manageProfile,setResidentAccess,setStaffSite} from './lib/admin-api';
import {parseAssignmentInput,parseProfileInput,parseSiteName,type AssignmentInput} from './lib/admin-input';
import './admin-team.css';

export type AdminSection = 'pending'|'roles'|'staff'|'residents';
interface Props {profile:Profile;residents:Resident[];sites:{id:string;name:string}[];onUpdated:()=>void;initialSection?:AdminSection}
type Scope = 'profile'|'site'|'staff'|'resident';
type Status = {scope:Scope;message:string;error:boolean};
type Run = (scope:Scope,task:()=>Promise<void>,message:string,onSuccess?:()=>void)=>Promise<void>;
const verificationText = 'Verifiqué la identidad y la autorización para este acceso';
const accessRoleNames = {...roleNames,owner:'Dirección general',manager:'Managers'};
type AdminAccount = Awaited<ReturnType<typeof getAdminAccounts>>[number];
type ProfileAccount = AdminAccount & {role:Role};

export function AdminAccess({profile,residents,sites,onUpdated,initialSection='pending'}:Props) {
  const [accounts,setAccounts] = useState<AdminAccount[]>([]);
  const [manualProfile,setManualProfile] = useState(false);
  const [accountsError,setAccountsError] = useState('');
  const [accountsLoading,setAccountsLoading] = useState(true);
  const [busy,setBusy] = useState<Scope|null>(null);
  const [status,setStatus] = useState<Status|null>(null);
  const [userId,setUserId] = useState('');
  const [fullName,setFullName] = useState('');
  const [profileSiteIds,setProfileSiteIds] = useState<string[]>([]);
  const [profileResidentIds,setProfileResidentIds] = useState<string[]>([]);
  const [scopeAssignments,setScopeAssignments] = useState<Awaited<ReturnType<typeof getSiteAssignments>>|null>(null);
  const [scopeError,setScopeError] = useState('');
  const [role,setRole] = useState<Role>('family');
  const [active,setActive] = useState(profile.active);
  const [verified,setVerified] = useState(false);
  const [siteName,setSiteName] = useState('');
  const [section,setSection] = useState<AdminSection>(initialSection==='roles'?'staff':initialSection);
  const [staffAction,setStaffAction] = useState<'grant'|'revoke'|'profile'>(initialSection==='roles'&&profile.role==='owner'?'profile':'grant');
  const [selectedSiteId,setSelectedSiteId] = useState('');
  const inFlight = useRef(false);
  const alive = useRef(false);
  const accountRequest = useRef(0);
  const owner = profile.role === 'owner';
  const administrator = owner || profile.role === 'manager';
  useEffect(()=>{
    if(!administrator)return;
    if(!['pending','roles','staff','residents'].includes(initialSection))return;
    setSection(initialSection==='roles'?'staff':initialSection);
    if(initialSection==='roles'&&owner)setStaffAction('profile');
  },[initialSection,administrator,owner]);

  async function refreshAccounts() {
    const request = ++accountRequest.current;
    if(alive.current)setAccountsLoading(true);
    try {
      const [accountResult,assignmentResult] = await Promise.allSettled([getAdminAccounts(),getSiteAssignments()]);
      if(alive.current && request === accountRequest.current) {
        if(accountResult.status==='fulfilled'){setAccounts(accountResult.value);setAccountsError('');}
        else setAccountsError('No se pudieron cargar las personas disponibles. Actualiza la lista para seleccionar una cuenta.');
        if(assignmentResult.status==='fulfilled'){setScopeAssignments(assignmentResult.value);setScopeError('');}
        else {setScopeAssignments(null);setScopeError('No se pudo consultar la sede actual de esta persona. Verifica y selecciona su alcance antes de guardar.');}
      }
    } catch {
      if(alive.current && request === accountRequest.current) setAccountsError('No se pudieron cargar las personas disponibles. Actualiza la lista para seleccionar una cuenta.');
    } finally {
      if(alive.current && request === accountRequest.current)setAccountsLoading(false);
    }
  }
  useEffect(() => {
    alive.current = true;
    if(administrator) void refreshAccounts();
    return () => {alive.current = false;accountRequest.current++;};
  },[profile.id,profile.role]);

  const run:Run = async (scope,task,message,onSuccess) => {
    if(inFlight.current) return;
    inFlight.current = true;setBusy(scope);setStatus(null);
    try {
      await task();
      if(!alive.current) return;
      setStatus({scope,message,error:false});onSuccess?.();
      void refreshAccounts();onUpdated();
    } catch(error) {
      if(alive.current) setStatus({scope,message:error instanceof Error ? error.message : 'No se confirmó el cambio. Revisa la conexión y vuelve a intentar.',error:true});
    } finally {
      inFlight.current = false;
      if(alive.current) setBusy(null);
    }
  };
  function editProfile() {setVerified(false);setStatus(null);}
  function chooseAccount(id:string) {
    setUserId(id);editProfile();
    const account = accounts.find(p => p.id === id.trim().toLowerCase());
    setFullName(account?.full_name ?? '');setRole(account?.role ?? 'family');setActive(account?.role?account.active:true);
    const linkedResidents=residents.filter(r=>scopeAssignments?.residents.some(link=>link.user_id===account?.id&&link.resident_id===r.id));
    const linkedSites=account?.role==='family'?linkedResidents.map(r=>r.site_id):scopeAssignments?.staff.filter(link=>link.user_id===account?.id&&sites.some(s=>s.id===link.site_id)).map(link=>link.site_id)??[];
    const requestedSite=sites.find(s=>s.id===account?.requested_site_id)?.id;
    setProfileSiteIds(account?.role==='owner'?[]:[...new Set(linkedSites.length?linkedSites:requestedSite?[requestedSite]:[])]);
    setProfileResidentIds(linkedResidents.map(r=>r.id));
  }
  function saveProfile(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run('profile',async () => {
      await manageProfile(parseProfileInput({userId,fullName,role,active,verified},profile),profile,{siteIds:role==='owner'?[]:profileSiteIds,residentIds:role==='family'||role==='nurse'?profileResidentIds:[]});
    },'Rol y permisos guardados. La persona verá su nuevo alcance al actualizar el portal.',() => setVerified(false));
  }
  function saveSite(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run('site',() => createSite(parseSiteName(siteName)),'Sede creada.',() => setSiteName(''));
  }
  if(!administrator) return null;
  const blocked = busy !== null || accountsLoading;
  const self = userId.trim().toLowerCase() === profile.id.toLowerCase();
  const profileAccounts = accounts.filter((p):p is ProfileAccount => p.role !== null);
  const staffAccounts = profileAccounts.filter(p => p.active && (owner ? ['manager','nurse'].includes(p.role) : p.role === 'nurse'));
  const nurseAccounts = profileAccounts.filter(p => p.active && p.role === 'nurse');
  const residentAccounts = profileAccounts.filter(p => p.active && p.role === 'family');
  const incompleteFamilyScope=role==='family'&&profileSiteIds.some(siteId=>!residents.some(r=>r.site_id===siteId&&profileResidentIds.includes(r.id)));

  return <section className="admin-access" aria-label="Administración de accesos">
    {accountsError && <div className="message error" role="alert"><p>{accountsError}</p><button type="button" className="button small outline" disabled={blocked} onClick={() => void refreshAccounts()}>Actualizar cuentas</button></div>}

    <nav className="admin-tabs" aria-label="Administración">
      <button type="button" className={`admin-tab admin-tab-pending${section==='pending'?' active':''}`} aria-pressed={section==='pending'} onClick={()=>setSection('pending')}><UserPlus size={24} aria-hidden="true"/><span>Dar de alta cuenta nueva, pendiente<small>Familiares o staff nuevo por confirmar acceso a su rol</small></span></button>
      <button type="button" className={`admin-tab admin-tab-staff${section==='staff'?' active':''}`} aria-pressed={section==='staff'} onClick={()=>setSection('staff')}><Building2 size={24} aria-hidden="true"/><span>Sedes y equipo<small>Dar permisos, revocar accesos y cambiar roles</small></span></button>
      <button type="button" className={`admin-tab admin-tab-family${section==='residents'?' active':''}`} aria-pressed={section==='residents'} onClick={()=>setSection('residents')}><HeartHandshake size={24} aria-hidden="true"/><span>Dar acceso familia a residente<small>Autorizar o retirar acceso al expediente</small></span></button>
    </nav>
    {accountsLoading&&<p className="message" role="status"><LoaderCircle className="spin" size={18} aria-hidden="true"/> Consultando cuentas y permisos…</p>}
    {section==='pending'&&!accountsLoading&&<><ManagerOnboarding accounts={accounts.filter(p => p.role === null)} residents={residents} sites={sites} onUpdated={()=>{void refreshAccounts();onUpdated();}}/>
    <details className="form-panel"><summary>¿La persona todavía no tiene cuenta? Invitar por correo</summary><InviteAccountForm onUpdated={()=>void refreshAccounts()}/></details>
    </>}
    {section==='staff'&&<><SiteTeam sites={sites} residents={residents} accounts={accounts} owner={owner} selectedSiteId={selectedSiteId} onSelectSite={setSelectedSiteId}/>
      {selectedSiteId&&<div className="team-action-tabs" aria-label="Acciones de equipo">
        <button type="button" aria-pressed={staffAction==='grant'} onClick={()=>{setStaffAction('grant');setStatus(null);}}><KeyRound size={20} aria-hidden="true"/> Dar permisos</button>
        <button type="button" aria-pressed={staffAction==='revoke'} onClick={()=>{setStaffAction('revoke');setStatus(null);}}><UserRoundMinus size={20} aria-hidden="true"/> Revocar accesos</button>
        {owner&&<button type="button" aria-pressed={staffAction==='profile'} onClick={()=>{setStaffAction('profile');setStatus(null);}}><UserRoundCog size={20} aria-hidden="true"/> Cambiar rol del perfil</button>}
      </div>}
    </>}
    {owner && section==='staff' && selectedSiteId && staffAction==='profile' && <section className="form-panel" aria-labelledby="account-heading">
      <h2 id="account-heading"><Users size={22} aria-hidden="true"/> Cambiar rol del perfil</h2>
      <p>Selecciona a la persona y revisa el rol, sus sedes y los residentes autorizados. Al guardar, esta selección sustituye sus permisos anteriores.</p>
      <form onSubmit={saveProfile} aria-busy={busy === 'profile'}>
        <label>Persona<select value={accounts.some(p => p.id === userId) ? userId : ''} disabled={blocked || manualProfile || !scopeAssignments} required={!manualProfile} onChange={e => chooseAccount(e.target.value)}><option value="">Seleccionar persona</option>{accounts.map(p => <option key={p.id} value={p.id}>{p.full_name || p.email} · {p.email} · {p.role?accessRoleNames[p.role]:'Sin rol'}{p.role&&!p.active ? ' · Inactiva' : ''}</option>)}</select></label>
        <div className="field-grid">
          <label>Nombre completo<input value={fullName} onChange={e => {setFullName(e.target.value);editProfile();}} disabled={blocked} required maxLength={160} autoComplete="off"/></label>
          <label>Rol<select value={role} onChange={e => {setRole(e.target.value as Role);setProfileSiteIds([]);setProfileResidentIds([]);editProfile();}} disabled={blocked || self}>{Object.entries(accessRoleNames).filter(([value]) => value !== 'patient').map(([value,name]) => <option key={value} value={value}>{name}</option>)}</select></label>
          <label>Estado<select value={active ? 'active' : 'inactive'} onChange={e => {setActive(e.target.value === 'active');editProfile();}} disabled={blocked || self}><option value="active">Activa</option><option value="inactive">Inactiva</option></select></label>
        </div>
        {role!=='owner'&&<ScopeChecklist title="Sedes autorizadas · puedes elegir varias" options={sites} selected={profileSiteIds} disabled={blocked} onChange={ids=>{setProfileSiteIds(ids);setProfileResidentIds(current=>current.filter(id=>residents.some(r=>r.id===id&&ids.includes(r.site_id))));editProfile();}}/>}
        {(role==='family'||role==='nurse')&&<ScopeChecklist title={role==='family'?'Residentes autorizados · puedes elegir varios':'Residentes a cargo'} options={residents.filter(r=>profileSiteIds.includes(r.site_id)).map(r=>({id:r.id,name:`${r.full_name} · ${sites.find(s=>s.id===r.site_id)?.name??'Sede'}`}))} selected={profileResidentIds} disabled={blocked} onChange={ids=>{setProfileResidentIds(ids);editProfile();}}/>}
        {scopeError&&<div className="message warning"><p>{scopeError}</p><button className="button small outline" type="button" disabled={blocked} onClick={()=>void refreshAccounts()}>Volver a consultar permisos</button></div>}
        {userId&&<p className="message">{fullName||'Esta persona'} quedará como {accessRoleNames[role]}, con cuenta {active?'activa':'inactiva'}.{role==='owner'?' Podrá administrar todas las sedes y los roles, incluida Dirección general.':` Tendrá ${profileSiteIds.length} ${profileSiteIds.length===1?'sede seleccionada':'sedes seleccionadas'}.`}{(role==='nurse'||role==='family')&&` Acceso a ${profileResidentIds.length} ${profileResidentIds.length===1?'residente seleccionado':'residentes seleccionados'}.`} Solo Dirección general puede conceder Dirección general o Managers.</p>}
        {role==='manager'&&<p className="caption">Cada Manager puede administrar una o varias sedes, sin asignaciones individuales a residentes.</p>}
        {role==='nurse'&&<p className="caption">Enfermería solo verá los residentes que selecciones. Para incluir a todos los de una sede, usa Dar permisos.</p>}
        {role==='family'&&<p className="caption">Elige al menos un residente de cada sede marcada. Familia solo puede consultar los residentes elegidos, nunca todos los de la sede.</p>}
        {self && <p className="caption">Tu propia cuenta debe permanecer activa y conservar el rol de Dirección general.</p>}
        <label className="checkbox"><input type="checkbox" checked={verified} onChange={e => {setVerified(e.target.checked);setStatus(null);}} disabled={blocked} required/>{verificationText}</label>
        <Feedback scope="profile" status={status}/>
        {!active&&<p className="caption">La cuenta inactiva no podrá consultar expedientes. Puedes desmarcar todas las sedes y residentes para retirar también sus asignaciones.</p>}
        <SaveButton saving={busy === 'profile'} disabled={blocked || !verified || !scopeAssignments || (active&&role!=='owner'&&profileSiteIds.length===0) || (role==='family'&&((active&&profileResidentIds.length===0)||incompleteFamilyScope))}>Guardar rol y permisos</SaveButton>
        <details onToggle={e => {setManualProfile(e.currentTarget.open);editProfile();}}><summary>Entrada manual para una cuenta existente</summary><p className="caption">Usa el identificador verificado de una cuenta que ya existe. Esta acción no crea una cuenta ni envía una invitación.</p><label>Identificador de la cuenta<input name="userId" value={userId} onChange={e => chooseAccount(e.target.value)} disabled={blocked || !manualProfile} required={manualProfile} maxLength={50} autoComplete="off" spellCheck={false}/></label></details>
      </form>
    </section>}

    {section==='staff'&&selectedSiteId&&staffAction!=='profile'&&!accountsLoading&&<section className="form-panel" aria-labelledby="sites-heading">
      <h2 id="sites-heading">{staffAction==='grant'?<KeyRound size={22} aria-hidden="true"/>:<UserRoundMinus size={22} aria-hidden="true"/>} {staffAction==='grant'?'Dar permisos':'Revocar accesos'}</h2>
      <p>{staffAction==='grant'?'Elige quién trabajará en una sede y qué residentes podrá atender. Puedes añadir varias asignaciones sin cambiar su rol.':'Retira el permiso específico de sede o residente. La persona conserva su cuenta y sus demás asignaciones.'}</p>
      <h3 className="assignment-heading">{staffAction==='grant'?'Permiso para trabajar en una sede':'Retirar acceso a una sede'}</h3>
      <AssignmentForm key={`staff-${staffAction}`} scope="staff" label="Sede" targets={sites} accounts={staffAccounts} busy={busy} status={status} run={run} clearStatus={() => setStatus(null)} mutate={setStaffSite} assigned={staffAction==='grant'} initialTargetId={selectedSiteId}/>
      <h3 className="assignment-heading">Residentes a cargo de enfermería</h3>
      <p>Asigna residentes individualmente o selecciona todos los actuales de una sede.</p>
      <AssignmentForm key={`resident-${staffAction}`} scope="resident" label="Residente" targets={residents.map(r => ({id:r.id,name:r.full_name}))} accounts={nurseAccounts} busy={busy} status={status} run={run} clearStatus={() => setStatus(null)} mutate={setResidentAccess} assigned={staffAction==='grant'}/>
      <SectorForm key={`sector-${staffAction}`} sites={sites} accounts={nurseAccounts} residents={residents} assignments={scopeAssignments} busy={busy} status={status} run={run} clearStatus={()=>setStatus(null)} grant={staffAction==='grant'} initialSiteId={selectedSiteId}/>
    </section>}
    {section==='staff'&&owner&&<details className="form-panel"><summary>Añadir otra sede</summary><form onSubmit={saveSite} aria-busy={busy === 'site'}>
        <label>Nombre de la nueva sede<input value={siteName} onChange={e => {setSiteName(e.target.value);setStatus(null);}} disabled={blocked} required maxLength={160}/></label>
        <Feedback scope="site" status={status}/>
        <SaveButton saving={busy === 'site'} disabled={blocked}>Crear sede</SaveButton>
      </form></details>}

    {section==='residents'&&!accountsLoading&&<section className="form-panel" aria-labelledby="resident-access-heading">
      <h2 id="resident-access-heading"><KeyRound size={22} aria-hidden="true"/> Dar acceso familia a residente</h2>
      <p>Selecciona al familiar y al residente cuyo expediente podrá consultar. Retirar el acceso elimina ese vínculo familiar.</p>
      <AssignmentForm scope="resident" label="Residente" targets={residents.map(r => ({id:r.id,name:r.full_name}))} accounts={residentAccounts} busy={busy} status={status} run={run} clearStatus={() => setStatus(null)} mutate={setResidentAccess}/>
    </section>}
  </section>;
}

interface AssignmentProps {
  scope:'staff'|'resident';label:string;targets:{id:string;name:string}[];accounts:ProfileAccount[];
  busy:Scope|null;status:Status|null;run:Run;clearStatus:()=>void;mutate:(input:AssignmentInput)=>Promise<void>;
  assigned?:boolean;initialTargetId?:string;
}
function AssignmentForm({scope,label,targets,accounts,busy,status,run,clearStatus,mutate,assigned:fixedAssigned,initialTargetId=''}:AssignmentProps) {
  const [userId,setUserId] = useState('');
  const [targetId,setTargetId] = useState('');
  const [assigned,setAssigned] = useState(fixedAssigned??true);
  const [verified,setVerified] = useState(false);
  const disabled = busy !== null;
  useEffect(()=>{setTargetId(initialTargetId);setVerified(false);},[initialTargetId]);
  function changed() {setVerified(false);clearStatus();}
  function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run(scope,async () => {
      await mutate(parseAssignmentInput({userId,targetId,assigned,verified}));
    },assigned ? 'Asignación confirmada.' : 'Revocación confirmada.',() => setVerified(false));
  }
  return <form onSubmit={submit} aria-busy={busy === scope}>
    <label>Persona<select value={accounts.some(p => p.id === userId) ? userId : ''} disabled={disabled} required onChange={e => {setUserId(e.target.value);changed();}}><option value="">Seleccionar persona</option>{accounts.map(p => <option key={p.id} value={p.id}>{p.full_name || p.email} · {p.email} · {accessRoleNames[p.role]}</option>)}</select></label>
    {accounts.length === 0 && <p className="message warning">No hay personas activas con un rol disponible para esta asignación.</p>}
    <div className="field-grid">
      <label>{label}<select value={targetId} onChange={e => {setTargetId(e.target.value);changed();}} disabled={disabled} required><option value="">Seleccionar {label.toLowerCase()}</option>{targets.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      {fixedAssigned===undefined&&<label>Acción<select value={assigned ? 'assign' : 'revoke'} onChange={e => {setAssigned(e.target.value === 'assign');changed();}} disabled={disabled}><option value="assign">Dar permisos</option><option value="revoke">Revocar acceso</option></select></label>}
    </div>
    {targets.length === 0 && <p className="message warning">No hay {scope === 'staff' ? 'sedes' : 'residentes'} autorizados disponibles. Actualiza la información o solicita la asignación correspondiente.</p>}
    {userId&&targetId&&<p className="message">{assigned?'Darás acceso a':'Retirarás el acceso de'} {accounts.find(p=>p.id===userId)?.full_name||'esta persona'} {assigned?'a':'en'} {targets.find(t=>t.id===targetId)?.name}. La acción se guardará en la auditoría.</p>}
    <label className="checkbox"><input type="checkbox" checked={verified} onChange={e => {setVerified(e.target.checked);clearStatus();}} disabled={disabled} required/>{verificationText}</label>
    <Feedback scope={scope} status={status}/>
    <SaveButton saving={busy === scope} disabled={disabled || !verified || targets.length === 0 || accounts.length === 0}>{assigned ? 'Dar permisos' : 'Revocar acceso'}</SaveButton>
  </form>;
}
export function ScopeChecklist({title,options,selected,disabled,onChange}:{title:string;options:{id:string;name:string}[];selected:string[];disabled:boolean;onChange:(ids:string[])=>void}) {
  return <fieldset className="scope-checklist" disabled={disabled}><legend>{title}</legend>
    {options.length===0?<p className="caption">No hay opciones disponibles. Selecciona una sede o registra los residentes antes de continuar.</p>:<div>{options.map(option=><label className="checkbox" key={option.id}><input type="checkbox" checked={selected.includes(option.id)} onChange={e=>onChange(e.target.checked?[...selected,option.id]:selected.filter(id=>id!==option.id))}/><span>{option.name}</span></label>)}</div>}
  </fieldset>;
}
function SectorForm({sites,accounts,residents,assignments,busy,status,run,clearStatus,grant,initialSiteId}:{sites:{id:string;name:string}[];accounts:ProfileAccount[];residents:Resident[];assignments:Awaited<ReturnType<typeof getSiteAssignments>>|null;busy:Scope|null;status:Status|null;run:Run;clearStatus:()=>void;grant:boolean;initialSiteId:string}) {
  const [siteId,setSiteId]=useState(initialSiteId),[accountId,setAccountId]=useState(''),[verified,setVerified]=useState(false);
  useEffect(()=>{setSiteId(initialSiteId);setAccountId('');setVerified(false);},[initialSiteId]);
  const eligible=accounts.filter(a=>assignments?.staff.some(link=>link.user_id===a.id&&link.site_id===siteId));
  const count=residents.filter(r=>r.site_id===siteId&&r.active).length;
  const blocked=busy!==null;
  function changed(){setVerified(false);clearStatus();}
  function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();if(!verified)return;void run('resident',()=>assignNurseSector(accountId,siteId,grant),grant?'Acceso a todos los residentes actuales de esta sede confirmado.':'Accesos de enfermería a residentes de esta sede retirados.',()=>setVerified(false));}
  return <details className="sector-access"><summary>{grant?'Todos los residentes de esta sede':'Revocar todos los residentes de esta sede'}</summary>
    <p>Aplica a los residentes activos actuales. Los nuevos residentes requieren una asignación posterior.</p>
    <form onSubmit={submit} aria-busy={busy==='resident'}><div className="field-grid">
      <label>Sede<select value={siteId} required disabled={blocked} onChange={e=>{setSiteId(e.target.value);setAccountId('');changed();}}><option value="">Seleccionar sede</option>{sites.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <label>Enfermería asignada a esta sede<select value={accountId} required disabled={blocked||!siteId} onChange={e=>{setAccountId(e.target.value);changed();}}><option value="">Seleccionar persona</option>{eligible.map(a=><option key={a.id} value={a.id}>{a.full_name||a.email} · {a.email}</option>)}</select></label>
    </div>
    {siteId&&<p className="caption">{count} residentes activos en {sites.find(s=>s.id===siteId)?.name}.{eligible.length===0?' Primero asigna Enfermería a la sede en Dar permisos.':''}</p>}
    {accountId&&<p className="message">{grant?'Darás permiso de atención a':'Retirarás los accesos de'} {eligible.find(a=>a.id===accountId)?.full_name||'esta persona'} para todos los residentes {grant?'activos actuales':'de la sede seleccionada'}.</p>}
    <label className="checkbox"><input type="checkbox" checked={verified} required disabled={blocked} onChange={e=>{setVerified(e.target.checked);clearStatus();}}/>{verificationText}</label>
    <Feedback scope="resident" status={status}/><SaveButton saving={busy==='resident'} disabled={blocked||!verified||!accountId||!siteId||(grant&&count===0)}>{grant?'Dar acceso a todos los residentes':'Revocar accesos del sector'}</SaveButton>
    </form>
  </details>;
}
function Feedback({scope,status}:{scope:Scope;status:Status|null}) {
  return status?.scope === scope ? <p className={status.error ? 'message error' : 'message'} role={status.error ? 'alert' : 'status'}>{status.message}</p> : null;
}
function SaveButton({saving,disabled,children}:{saving:boolean;disabled:boolean;children:string}) {
  return <div className="actions"><button className="button" type="submit" disabled={disabled}>{saving && <LoaderCircle className="spin" size={17} aria-hidden="true"/>}{saving ? 'Guardando…' : children}</button></div>;
}

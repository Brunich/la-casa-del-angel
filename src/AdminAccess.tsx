import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Building2,HeartHandshake,KeyRound,LoaderCircle,ShieldCheck,UserPlus,Users} from 'lucide-react';
import {ManagerOnboarding} from './ManagerOnboarding';
import {SiteTeam} from './SiteTeam';
import {InviteAccountForm} from './InviteAccountForm';
import {roleNames,type Profile,type Resident,type Role} from './domain';
import {createSite,getAdminAccounts,getSiteAssignments,manageProfile,setResidentAccess,setStaffSite} from './lib/admin-api';
import {parseAssignmentInput,parseProfileInput,parseSiteName,type AssignmentInput} from './lib/admin-input';

interface Props {profile:Profile;residents:Resident[];sites:{id:string;name:string}[];onUpdated:()=>void}
type Scope = 'profile'|'site'|'staff'|'resident';
type Status = {scope:Scope;message:string;error:boolean};
type Run = (scope:Scope,task:()=>Promise<void>,message:string,onSuccess?:()=>void)=>Promise<void>;
const verificationText = 'Verifiqué la identidad y la autorización para este acceso';
const accessRoleNames = {...roleNames,owner:'Dirección general',manager:'Managers'};
type AdminAccount = Awaited<ReturnType<typeof getAdminAccounts>>[number];
type ProfileAccount = AdminAccount & {role:Role};

export function AdminAccess({profile,residents,sites,onUpdated}:Props) {
  const [accounts,setAccounts] = useState<AdminAccount[]>([]);
  const [manualProfile,setManualProfile] = useState(false);
  const [accountsError,setAccountsError] = useState('');
  const [busy,setBusy] = useState<Scope|null>(null);
  const [status,setStatus] = useState<Status|null>(null);
  const [userId,setUserId] = useState('');
  const [fullName,setFullName] = useState('');
  const [profileSiteId,setProfileSiteId] = useState('');
  const [profileResidentId,setProfileResidentId] = useState('');
  const [scopeAssignments,setScopeAssignments] = useState<Awaited<ReturnType<typeof getSiteAssignments>>|null>(null);
  const [scopeError,setScopeError] = useState('');
  const [role,setRole] = useState<Role>('family');
  const [active,setActive] = useState(profile.active);
  const [verified,setVerified] = useState(false);
  const [siteName,setSiteName] = useState('');
  const [section,setSection] = useState<'pending'|'roles'|'staff'|'residents'>('pending');
  const inFlight = useRef(false);
  const alive = useRef(false);
  const accountRequest = useRef(0);
  const owner = profile.role === 'owner';
  const administrator = owner || profile.role === 'manager';

  async function refreshAccounts() {
    const request = ++accountRequest.current;
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
    setFullName(account?.full_name ?? '');setRole(account?.role ?? 'family');setActive(account?.active ?? true);
    const resident = account?.role==='family'?residents.find(r=>scopeAssignments?.residents.some(link=>link.user_id===account.id&&link.resident_id===r.id)):undefined;
    const siteId = resident?.site_id ?? scopeAssignments?.staff.find(link=>link.user_id===id&&sites.some(s=>s.id===link.site_id))?.site_id ?? sites.find(s=>s.id===account?.requested_site_id)?.id ?? '';
    setProfileSiteId(account?.role==='owner'?'':siteId);setProfileResidentId(resident?.id??'');
  }
  function saveProfile(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run('profile',async () => {
      await manageProfile(parseProfileInput({userId,fullName,role,active,verified},profile),profile,{siteId:role==='owner'?null:profileSiteId,residentId:role==='family'||role==='nurse'?profileResidentId||null:null});
    },'Perfil confirmado. Sus permisos dependen del rol, las asignaciones y la sesión vigente.',() => setVerified(false));
  }
  function saveSite(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run('site',() => createSite(parseSiteName(siteName)),'Sede creada.',() => setSiteName(''));
  }
  if(!administrator) return null;
  const blocked = busy !== null;
  const self = userId.trim().toLowerCase() === profile.id.toLowerCase();
  const profileAccounts = accounts.filter((p):p is ProfileAccount => p.role !== null);
  const staffAccounts = profileAccounts.filter(p => p.active && (owner ? ['manager','nurse'].includes(p.role) : p.role === 'nurse'));
  const nurseAccounts = profileAccounts.filter(p => p.active && p.role === 'nurse');
  const residentAccounts = profileAccounts.filter(p => p.active && p.role === 'family');

  return <section aria-label="Administración de accesos">
    <div className="panel-heading"><div><h2><ShieldCheck size={22} aria-hidden="true"/> Administrar accesos</h2><p>Selecciona a una persona para darle un rol, asignarle una sede o autorizar el acceso a un residente.</p></div></div>
    <p className="message">La persona debe tener una cuenta y confirmar su correo antes del alta. Aquí puedes habilitar su acceso y sus asignaciones.</p>
    {accountsError && <div className="message error" role="alert"><p>{accountsError}</p><button type="button" className="button small outline" disabled={blocked} onClick={() => void refreshAccounts()}>Actualizar cuentas</button></div>}

    <nav className="admin-tabs" aria-label="Administración">
      <button type="button" className={`admin-tab admin-tab-pending${section==='pending'?' active':''}`} aria-pressed={section==='pending'} onClick={()=>setSection('pending')}><UserPlus size={24} aria-hidden="true"/><span>Dar de alta cuenta nueva<small>Pendientes de confirmar o asignar rol</small></span></button>
      {owner&&<button type="button" className={`admin-tab admin-tab-roles${section==='roles'?' active':''}`} aria-pressed={section==='roles'} onClick={()=>setSection('roles')}><ShieldCheck size={24} aria-hidden="true"/><span>Cambiar roles<small>Nombre, permisos y estado de la cuenta</small></span></button>}
      <button type="button" className={`admin-tab admin-tab-staff${section==='staff'?' active':''}`} aria-pressed={section==='staff'} onClick={()=>setSection('staff')}><Building2 size={24} aria-hidden="true"/><span>Sedes y equipo<small>Managers, enfermería y residentes</small></span></button>
      <button type="button" className={`admin-tab admin-tab-family${section==='residents'?' active':''}`} aria-pressed={section==='residents'} onClick={()=>setSection('residents')}><HeartHandshake size={24} aria-hidden="true"/><span>Dar acceso familia a residente<small>Autorizar o retirar acceso al expediente</small></span></button>
    </nav>
    {section==='pending'&&<><ManagerOnboarding accounts={accounts.filter(p => p.role === null)} residents={residents} sites={sites} onUpdated={()=>{void refreshAccounts();onUpdated();}}/>
    <details className="form-panel"><summary>¿La persona todavía no tiene cuenta? Invitar por correo</summary><InviteAccountForm onUpdated={()=>void refreshAccounts()}/></details>
    </>}
    {owner && section==='roles' && <section className="form-panel" aria-labelledby="account-heading">
      <h2 id="account-heading"><Users size={22} aria-hidden="true"/> Cuentas y roles</h2>
      <p>Dirección general puede cambiar el nombre, el rol, la sede o el estado de una cuenta. El rol y su alcance se guardan juntos. Desactivar su cuenta impide su acceso.</p>
      <form onSubmit={saveProfile} aria-busy={busy === 'profile'}>
        <label>Persona<select value={accounts.some(p => p.id === userId) ? userId : ''} disabled={blocked || manualProfile} required={!manualProfile} onChange={e => chooseAccount(e.target.value)}><option value="">Seleccionar persona</option>{accounts.map(p => <option key={p.id} value={p.id}>{p.full_name || p.email} · {p.email} · {p.role?accessRoleNames[p.role]:'Sin rol'}{p.role&&!p.active ? ' · Inactiva' : ''}</option>)}</select></label>
        <div className="field-grid">
          <label>Nombre completo<input value={fullName} onChange={e => {setFullName(e.target.value);editProfile();}} disabled={blocked} required maxLength={160} autoComplete="off"/></label>
          <label>Rol<select value={role} onChange={e => {setRole(e.target.value as Role);setProfileSiteId('');setProfileResidentId('');editProfile();}} disabled={blocked || self}>{Object.entries(accessRoleNames).filter(([value]) => value !== 'patient').map(([value,name]) => <option key={value} value={value}>{name}</option>)}</select></label>
          <label>Estado<select value={active ? 'active' : 'inactive'} onChange={e => {setActive(e.target.value === 'active');editProfile();}} disabled={blocked || self}><option value="active">Activa</option><option value="inactive">Inactiva</option></select></label>
          {role!=='owner'&&<label>Sede<select value={profileSiteId} required disabled={blocked} onChange={e=>{setProfileSiteId(e.target.value);setProfileResidentId('');editProfile();}}><option value="">Seleccionar sede</option>{sites.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
          {(role==='family'||role==='nurse')&&<label>{role==='family'?'Residente autorizado':'Añadir residente a cargo (opcional)'}<select value={profileResidentId} required={role==='family'} disabled={blocked||!profileSiteId} onChange={e=>{setProfileResidentId(e.target.value);editProfile();}}><option value="">{role==='family'?'Seleccionar residente':'Conservar residentes de esta sede'}</option>{residents.filter(r=>r.site_id===profileSiteId).map(r=><option key={r.id} value={r.id}>{r.full_name}</option>)}</select></label>}
        </div>
        {scopeError&&<p className="message warning">{scopeError}</p>}
        {userId&&<p className="message">Guardar dará a {fullName||'esta persona'} el rol {accessRoleNames[role]} y dejará su cuenta {active?'activa':'inactiva'}.{role==='owner'?' Tendrá acceso global a las sedes.':` Su sede será ${sites.find(s=>s.id===profileSiteId)?.name||'la que selecciones'}.`}{role==='family'&&` Podrá consultar el expediente de ${residents.find(r=>r.id===profileResidentId)?.full_name||'el residente que selecciones'}.`} Cambiar el rol sustituye sus asignaciones anteriores. Solo Dirección general puede conceder Dirección general o Managers.</p>}
        {role==='manager'&&<p className="caption">El Manager será responsable de una sede; no necesita asignaciones individuales a residentes.</p>}
        {role==='nurse'&&<p className="caption">Al guardar Enfermería se conservan sus residentes de la sede elegida. Los accesos a otras sedes se retiran.</p>}
        {role==='family'&&<p className="caption">Familia queda vinculada únicamente al residente elegido; esta selección sustituye sus vínculos familiares anteriores.</p>}
        {self && <p className="caption">Tu propia cuenta debe permanecer activa y conservar el rol de Dirección general.</p>}
        <label className="checkbox"><input type="checkbox" checked={verified} onChange={e => {setVerified(e.target.checked);setStatus(null);}} disabled={blocked} required/>{verificationText}</label>
        <Feedback scope="profile" status={status}/>
        <SaveButton saving={busy === 'profile'} disabled={blocked || !verified}>Guardar perfil</SaveButton>
        <details onToggle={e => {setManualProfile(e.currentTarget.open);editProfile();}}><summary>Entrada manual para una cuenta existente</summary><p className="caption">Usa el identificador verificado de una cuenta que ya existe. Esta acción no crea una cuenta ni envía una invitación.</p><label>Identificador de la cuenta<input name="userId" value={userId} onChange={e => chooseAccount(e.target.value)} disabled={blocked || !manualProfile} required={manualProfile} maxLength={50} autoComplete="off" spellCheck={false}/></label></details>
      </form>
    </section>}

    {section==='staff'&&<><SiteTeam sites={sites} residents={residents} accounts={accounts} owner={owner}/><section className="form-panel" aria-labelledby="sites-heading">
      <h2 id="sites-heading"><Building2 size={22} aria-hidden="true"/> Sedes y personal</h2>
      <p>{owner ? 'Crea una sede o asigna Managers y enfermería a su lugar de trabajo. Dirección general tiene acceso global y no necesitan sede. Revocar elimina la asignación a esa sede.' : 'Los Managers pueden asignar o retirar enfermería de las sedes que administran.'}</p>
      {owner && <form onSubmit={saveSite} aria-busy={busy === 'site'}>
        <label>Nombre de la nueva sede<input value={siteName} onChange={e => {setSiteName(e.target.value);setStatus(null);}} disabled={blocked} required maxLength={160}/></label>
        <Feedback scope="site" status={status}/>
        <SaveButton saving={busy === 'site'} disabled={blocked}>Crear sede</SaveButton>
      </form>}
      <AssignmentForm scope="staff" label="Sede" targets={sites} accounts={staffAccounts} busy={busy} status={status} run={run} clearStatus={() => setStatus(null)} mutate={setStaffSite}/>
      <h3 className="assignment-heading">Residentes a cargo de enfermería</h3>
      <p>Asigna los residentes que atiende cada persona de enfermería. Necesita primero acceso a la sede del residente.</p>
      <AssignmentForm scope="resident" label="Residente" targets={residents.map(r => ({id:r.id,name:r.full_name}))} accounts={nurseAccounts} busy={busy} status={status} run={run} clearStatus={() => setStatus(null)} mutate={setResidentAccess}/>
    </section></>}

    {section==='residents'&&<section className="form-panel" aria-labelledby="resident-access-heading">
      <h2 id="resident-access-heading"><KeyRound size={22} aria-hidden="true"/> Dar acceso familia a residente</h2>
      <p>Selecciona al familiar y al residente cuyo expediente podrá consultar. Retirar el acceso elimina ese vínculo familiar.</p>
      <AssignmentForm scope="resident" label="Residente" targets={residents.map(r => ({id:r.id,name:r.full_name}))} accounts={residentAccounts} busy={busy} status={status} run={run} clearStatus={() => setStatus(null)} mutate={setResidentAccess}/>
    </section>}
  </section>;
}

interface AssignmentProps {
  scope:'staff'|'resident';label:string;targets:{id:string;name:string}[];accounts:ProfileAccount[];
  busy:Scope|null;status:Status|null;run:Run;clearStatus:()=>void;mutate:(input:AssignmentInput)=>Promise<void>;
}
function AssignmentForm({scope,label,targets,accounts,busy,status,run,clearStatus,mutate}:AssignmentProps) {
  const [userId,setUserId] = useState('');
  const [targetId,setTargetId] = useState('');
  const [assigned,setAssigned] = useState(true);
  const [verified,setVerified] = useState(false);
  const disabled = busy !== null;
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
      <label>Acción<select value={assigned ? 'assign' : 'revoke'} onChange={e => {setAssigned(e.target.value === 'assign');changed();}} disabled={disabled}><option value="assign">Asignar acceso</option><option value="revoke">Revocar acceso</option></select></label>
    </div>
    {targets.length === 0 && <p className="message warning">No hay {scope === 'staff' ? 'sedes' : 'residentes'} autorizados disponibles. Actualiza la información o solicita la asignación correspondiente.</p>}
    {userId&&targetId&&<p className="message">{assigned?'Darás acceso a':'Retirarás el acceso de'} {accounts.find(p=>p.id===userId)?.full_name||'esta persona'} {assigned?'a':'en'} {targets.find(t=>t.id===targetId)?.name}. La acción se guardará en la auditoría.</p>}
    <label className="checkbox"><input type="checkbox" checked={verified} onChange={e => {setVerified(e.target.checked);clearStatus();}} disabled={disabled} required/>{verificationText}</label>
    <Feedback scope={scope} status={status}/>
    <SaveButton saving={busy === scope} disabled={disabled || !verified || targets.length === 0 || accounts.length === 0}>{assigned ? 'Asignar acceso' : 'Revocar acceso'}</SaveButton>
  </form>;
}
function Feedback({scope,status}:{scope:Scope;status:Status|null}) {
  return status?.scope === scope ? <p className={status.error ? 'message error' : 'message'} role={status.error ? 'alert' : 'status'}>{status.message}</p> : null;
}
function SaveButton({saving,disabled,children}:{saving:boolean;disabled:boolean;children:string}) {
  return <div className="actions"><button className="button" type="submit" disabled={disabled}>{saving && <LoaderCircle className="spin" size={17} aria-hidden="true"/>}{saving ? 'Guardando…' : children}</button></div>;
}

import {ArrowRight,Building2,KeyRound,Stethoscope,UserPlus,Users} from 'lucide-react';
import type {Role} from './domain';
import type {AdminSection} from './AdminAccess';
import './role-overview.css';
interface Props {role:Role;sitesCount?:number;residentsCount?:number;onAdminSection?:(section:AdminSection)=>void;onCare?:()=>void;onCreate?:()=>void}
export function RoleOverview({role,sitesCount,residentsCount,onAdminSection,onCare,onCreate}:Props){
 const manage=role==='owner'||role==='manager';
 return <section className={`role-overview role-overview-${role}`} aria-label="Acciones de tu portal">
  {manage&&onAdminSection?<>
   <nav className="workspace-shortcuts" aria-label="Tareas de administración">
    <button className="workspace-shortcut team-shortcut" onClick={()=>onAdminSection('staff')}><Building2 size={28} aria-hidden="true"/><span><strong>Sedes y equipo</strong><small>Organiza responsables, da permisos y cambia roles.</small></span><ArrowRight size={20} aria-hidden="true"/></button>
    <button className="workspace-shortcut account-shortcut" onClick={()=>onAdminSection('pending')}><UserPlus size={26} aria-hidden="true"/><span><strong>Dar de alta cuenta nueva, pendiente</strong><small>Familiares o staff nuevo por confirmar acceso a su rol.</small></span><ArrowRight size={20} aria-hidden="true"/></button>
    <button className="workspace-shortcut family-shortcut" onClick={()=>onAdminSection('residents')}><KeyRound size={26} aria-hidden="true"/><span><strong>Dar acceso familia a residente</strong><small>Elige familiares y los expedientes que podrán consultar.</small></span><ArrowRight size={20} aria-hidden="true"/></button>
   </nav>
   <div className="workspace-care-entry"><div><h2><Stethoscope size={23} aria-hidden="true"/> Cuidados y residentes</h2><p>Consulta el día, registra cuidados y revisa medicamentos.</p></div><div className="actions"><button className="button" onClick={onCare}>Abrir cuidados</button><button className="button outline" onClick={onCreate}>Registrar residente</button></div></div>
   <dl className="workspace-summary"><div><dt>Sedes</dt><dd>{sitesCount??0}</dd></div><div><dt>Residentes disponibles</dt><dd>{residentsCount??0}</dd></div></dl>
  </>:<div className="workspace-care-entry"><Users size={28} aria-hidden="true"/><p>{role==='family'?'Elige a tu familiar para consultar su bitácora, medicamentos y fotografías.':'Elige un residente para registrar y consultar sus cuidados.'}</p><button className="button" onClick={onCare}>Abrir cuidados</button></div>}
 </section>;
}

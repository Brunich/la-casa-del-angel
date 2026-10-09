import {useState} from 'react';
import {ArrowRight,Building2,HeartHandshake,KeyRound,ShieldCheck,Stethoscope,UserPlus,Users} from 'lucide-react';
import {roleNames,type Role} from './domain';
import type {AdminSection} from './AdminAccess';
import './role-overview.css';
const descriptions:Record<Role,{title:string;description:string;access:string}>={
 owner:{title:'Dirección general',description:'Organiza las sedes, revisa las cuentas y decide quién puede entrar a cada espacio de cuidados.',access:'Todas las sedes. Puede activar perfiles y administrar asignaciones.'},
 manager:{title:'Managers · Organización del cuidado',description:'Registra residentes y asigna enfermería y familiares dentro de tus sedes.',access:'Solo sus sedes. Vincula cuentas activadas por dirección; no puede asignar Dirección general ni Managers.'},
 nurse:{title:'Enfermería · Cuidados del turno',description:'Registra cuidados, medicamentos, fotografías e incidentes de tus residentes asignados.',access:'Necesita asignación tanto a la sede como al residente. No administra cuentas.'},
 family:{title:'Familia · Acompañar a tu ser querido',description:'Consulta los cuidados, medicamentos y fotografías autorizadas de tu familiar.',access:'Solo los residentes vinculados a su cuenta. Consulta sin editar registros.'},
 patient:{title:'Residente · Tus cuidados',description:'Consulta tu propia bitácora, medicamentos y fotografías autorizadas.',access:'Solo su expediente. Consulta sin editar registros.'}
};
interface Props {role:Role;sitesCount?:number;residentsCount?:number;onAdminSection?:(section:AdminSection)=>void}
const shortcuts=[
 {section:'staff' as const,label:'Sedes y equipo',description:'Consulta responsables, enfermería y residentes por sede.',icon:Building2},
 {section:'pending' as const,label:'Dar de alta cuentas',description:'Revisa los correos confirmados y habilita sus accesos.',icon:UserPlus},
 {section:'roles' as const,label:'Cambiar roles',description:'Define permisos, sede y estado en un solo cambio.',icon:ShieldCheck},
 {section:'residents' as const,label:'Accesos familiares',description:'Autoriza o retira el vínculo con un expediente.',icon:KeyRound}
];
export function RoleOverview({role,sitesCount,residentsCount,onAdminSection}:Props){
 const[selected,setSelected]=useState<Role>('manager');const current=descriptions[role];
 const validCount=(value:number|undefined)=>typeof value==='number'&&Number.isInteger(value)&&value>=0;
 const Icon=role==='owner'?ShieldCheck:role==='manager'?Users:role==='nurse'?Stethoscope:HeartHandshake;
 return <section className={`role-overview role-overview-${role}`} aria-label="Tu portal">
  <div className="role-overview-heading"><Icon size={role==='owner'?38:28} strokeWidth={1.5} aria-hidden="true"/><div><h2>{current.title}</h2><p>{current.description}</p></div></div>
  {role==='owner'?<>
   {(validCount(sitesCount)||validCount(residentsCount))&&<dl className="direction-scope" aria-label="Alcance de esta consulta">
    {validCount(sitesCount)&&<div><dt>Sedes disponibles</dt><dd>{sitesCount}</dd></div>}
    {validCount(residentsCount)&&<div><dt>Residentes autorizados</dt><dd>{residentsCount}</dd></div>}
   </dl>}
   <p className="role-overview-note">Tu acceso abarca todas las sedes. Las cantidades muestran únicamente los datos cargados en esta consulta.</p>
   {onAdminSection&&<nav className="direction-actions" aria-label="Acciones de Dirección general">{shortcuts.map(({section,label,description,icon:ActionIcon})=><button key={section} type="button" className={`direction-action direction-action-${section}`} onClick={()=>onAdminSection(section)}><ActionIcon size={24} aria-hidden="true"/><span><strong>{label}</strong><small>{description}</small></span><ArrowRight size={20} aria-hidden="true"/></button>)}</nav>}
   <details className="direction-permissions"><summary>Consultar permisos de cada portal</summary><label>Rol<select value={selected} onChange={e=>setSelected(e.target.value as Role)}>{Object.entries(roleNames).filter(([value])=>value!=='patient').map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><h3>{descriptions[selected].title}</h3><p>{descriptions[selected].description}</p><p>{descriptions[selected].access}</p><p className="role-overview-note">Esta consulta explica el alcance. Tu sesión continúa siendo de Dirección general.</p></details>
  </>:<p className="role-overview-note">{current.access}</p>}
 </section>;
}

import {useState} from 'react';
import {roleNames,type Role} from './domain';
const descriptions:Record<Role,{title:string;description:string;access:string}>={
 owner:{title:'Dirección general · Supervisión de la residencia',description:'Organiza sedes, cuentas y accesos. Supervisa los cuidados del equipo.',access:'Todas las sedes. Puede activar perfiles y administrar asignaciones.'},
 manager:{title:'Managers · Organización del cuidado',description:'Registra residentes y asigna enfermería y familiares dentro de tus sedes.',access:'Solo sus sedes. Vincula cuentas activadas por dirección; no puede asignar Dirección general ni Managers.'},
 nurse:{title:'Enfermería · Cuidados del turno',description:'Registra cuidados, medicamentos, fotografías e incidentes de tus residentes asignados.',access:'Necesita asignación tanto a la sede como al residente. No administra cuentas.'},
 family:{title:'Familia · Acompañar a tu ser querido',description:'Consulta los cuidados, medicamentos y fotografías autorizadas de tu familiar.',access:'Solo los residentes vinculados a su cuenta. Consulta sin editar registros.'},
 patient:{title:'Residente · Tus cuidados',description:'Consulta tu propia bitácora, medicamentos y fotografías autorizadas.',access:'Solo su expediente. Consulta sin editar registros.'}
};
export function RoleOverview({role}:{role:Role}){
 const[selected,setSelected]=useState<Role>('manager');const current=descriptions[role];
 return <section className="form-panel" aria-label="Tu portal"><h2>{current.title}</h2><p>{current.description}</p>{role==='owner'&&<details><summary>Consultar permisos de cada portal</summary><label>Rol<select value={selected} onChange={e=>setSelected(e.target.value as Role)}>{Object.entries(roleNames).filter(([value])=>value!=='patient').map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><h3>{descriptions[selected].title}</h3><p>{descriptions[selected].description}</p><p>{descriptions[selected].access}</p><p className="caption">Esta consulta explica el alcance. Tu sesión continúa siendo de Dirección general; las pruebas de aislamiento requieren cuentas separadas.</p></details>}</section>;
}

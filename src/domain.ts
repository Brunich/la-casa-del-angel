export type Role='owner'|'manager'|'nurse'|'family'|'patient';
export type CareKind='bath'|'meal'|'activity'|'medication'|'incident'|'observation';
export const kinds:Record<CareKind,string>={bath:'Baño',meal:'Alimentación',activity:'Actividad',medication:'Medicamento',incident:'Incidente',observation:'Observación'};
export interface Profile{id:string;full_name:string;role:Role;active:boolean}
export interface Resident{id:string;full_name:string;site_id:string;room:string;active:boolean;photo_consent:boolean}
export interface CareEvent{id:string;resident_id:string;actor_id:string;kind:CareKind;occurred_at:string;recorded_at:string;notes:string|null;details:Record<string,unknown>;photo_path:string|null}
export interface MedicationPlan{id:string;resident_id:string;name:string;dose_amount:number;dose_unit:string;stock_unit:string;units_per_dose:number;doses_per_day:number|null;stock_remaining:number;low_stock_threshold:number;active:boolean}
export interface Reminder{id:string;resident_id:string;kind:CareKind;due_at:string;completed_at:string|null;cancelled_at:string|null;user_id:string;medication_plan_id?:string|null}
export interface MedicationMovement{id:string;plan_id:string;medication_name:string;event_id:string|null;units_delta:number;stock_unit:string;created_at:string;reason:string;actor_name:string}
export interface CareDraft{kind:CareKind;occurred_at:string;notes:string;details:Record<string,unknown>;photo_path?:string|null;medication_plan_id?:string|null;units_taken?:number|null}
export function medicationForecast(plan:Pick<MedicationPlan,'stock_remaining'|'units_per_dose'|'doses_per_day'|'low_stock_threshold'>,now=new Date()){
 const stock=Number(plan.stock_remaining),units=Number(plan.units_per_dose),threshold=Number(plan.low_stock_threshold),daily=plan.doses_per_day===null?null:Number(plan.doses_per_day);
 if(!Number.isFinite(stock)||stock<0||!Number.isFinite(units)||units<=0||!Number.isFinite(threshold)||threshold<0||(daily!==null&&(!Number.isFinite(daily)||daily<=0)))throw new Error('Pauta o existencia inválida');
 const days=daily===null?null:stock/(units*daily);
 return{lowStock:stock<=threshold,daysRemaining:days,runsOutAt:days===null?null:new Date(now.getTime()+days*86400000).toISOString(),lowStockAt:daily===null?null:new Date(now.getTime()+Math.max(0,stock-threshold)/(units*daily)*86400000).toISOString()};
}
export function pendingReminders<T extends Pick<Reminder,'due_at'|'completed_at'>&{cancelled_at?:string|null}>(reminders:T[],now=new Date()){return reminders.filter(r=>!r.completed_at&&!r.cancelled_at&&new Date(r.due_at).getTime()<=now.getTime())}
export function validateCareDraft(draft:CareDraft,photoConsent:boolean):string[]{
 const errors:string[]=[];
 if(!kinds[draft.kind])errors.push('Selecciona un tipo de cuidado.');
 const timestamp=new Date(draft.occurred_at).getTime();
 if(!Number.isFinite(timestamp)||timestamp>Date.now()+300000)errors.push('Verifica la fecha y hora del cuidado.');
 if(draft.notes.length>4000)errors.push('Las notas deben tener hasta 4,000 caracteres.');
 if(draft.photo_path&&!photoConsent)errors.push('Este residente no tiene autorización para fotografías.');
 if(draft.kind==='meal'&&(!['Desayuno','Comida','Cena','Colación'].includes(String(draft.details.meal))||!['Todo','La mayor parte','La mitad','Poco','No comió'].includes(String(draft.details.intake))))errors.push('Indica la comida y cuánto comió el residente.');
 if(draft.kind==='activity'&&(!String(draft.details.activity??'').trim()||String(draft.details.activity).trim().length>200||!/^\d{1,3}$/.test(String(draft.details.minutes??''))||Number(draft.details.minutes)<1||Number(draft.details.minutes)>600))errors.push('Indica la actividad y una duración de 1 a 600 minutos completos.');
 if(draft.kind==='incident'){
   if(!String(draft.details.incident_type??'').trim())errors.push('Selecciona el incidente.');
   if(!String(draft.details.handled_by??'').trim())errors.push('Indica quién atendió al paciente.');
   if(!String(draft.details.actions??'').trim())errors.push('Describe la atención brindada.');
 }
 if(draft.kind==='medication'){
   if(!['administered','refused','omitted'].includes(String(draft.details.status)))errors.push('Selecciona el resultado de la toma.');
   if(!draft.medication_plan_id)errors.push('Selecciona un medicamento de la pauta.');
   if(draft.details.status==='administered'){
     if(!Number.isFinite(draft.units_taken)||Number(draft.units_taken)<=0)errors.push('Verifica la cantidad administrada.');
     if(photoConsent&&!draft.photo_path)errors.push('Adjunta la foto de la toma.');
     if(!photoConsent&&!String(draft.details.no_photo_reason??'').trim())errors.push('Documenta el motivo de la toma sin fotografía.');
   }else if(!draft.notes.trim())errors.push('Explica por qué no se administró.');
 }
 return errors;
}
export const dateTime=(value:string)=>new Intl.DateTimeFormat('es-MX',{timeZone:'America/Mexico_City',dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
export const shortDate=(value:string)=>new Intl.DateTimeFormat('es-MX',{timeZone:'America/Mexico_City',dateStyle:'medium'}).format(new Date(value));
export const roleNames:Record<Role,string>={owner:'Dirección general',manager:'Managers',nurse:'Enfermería',family:'Familia',patient:'Residente'};

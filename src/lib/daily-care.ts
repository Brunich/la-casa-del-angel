export interface DailyResident{id:string;name:string;site_id:string;photo_consent:boolean;events:{kind:string;meal?:string|null;plan_id?:string|null;status?:string|null;has_photo:boolean;no_photo_reason?:boolean}[];plans:{id:string;name:string;doses_per_day:number|null}[]}
export interface CareGap{residentId:string;residentName:string;kind:'meal'|'bath'|'activity'|'medication';label:string}
export function dailyCareGaps(resident:DailyResident):CareGap[]{
 const gaps:CareGap[]=[];
 const add=(kind:CareGap['kind'],label:string)=>gaps.push({residentId:resident.id,residentName:resident.name,kind,label});
 for(const meal of ['Desayuno','Comida','Cena']){
  const events=resident.events.filter(event=>event.kind==='meal'&&event.meal===meal);
  if(!events.length)add('meal',meal+': cuidado sin registrar');
  else if(resident.photo_consent&&!events.some(event=>event.has_photo||event.no_photo_reason))add('meal',meal+': falta fotografía');
 }
 for(const [kind,label] of [['bath','Baño'],['activity','Actividad']] as const){
  const events=resident.events.filter(event=>event.kind===kind);
  if(!events.length)add(kind,label+': cuidado sin registrar');
  else if(resident.photo_consent&&!events.some(event=>event.has_photo||event.no_photo_reason))add(kind,label+': falta fotografía');
 }
 for(const plan of resident.plans){
  const events=resident.events.filter(event=>event.kind==='medication'&&event.plan_id===plan.id);
  const daily=Number(plan.doses_per_day);
  if(plan.doses_per_day!==null&&Number.isFinite(daily)&&daily>events.length)add('medication',`${plan.name}: ${daily-events.length} tomas del día sin registrar`);
  const missing=events.filter(event=>event.status==='administered'&&resident.photo_consent&&!event.has_photo&&!event.no_photo_reason).length;
  if(missing)add('medication',`${plan.name}: falta fotografía en ${missing} ${missing===1?'toma':'tomas'}`);
 }
 return gaps;
}

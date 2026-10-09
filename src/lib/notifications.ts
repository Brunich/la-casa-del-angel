import {Capacitor} from '@capacitor/core';
import {LocalNotifications} from '@capacitor/local-notifications';
import type {MedicationPlan,Reminder} from '../domain';
import {medicationForecast} from '../domain';
import {NotificationQueue} from './notification-queue';
let allowed=false,permissionEpoch=0;
const shown=new Set<string>();
const queue=new NotificationQueue();
const notificationId=(value:string)=>{let hash=2166136261;for(const c of value)hash=Math.imul(hash^c.charCodeAt(0),16777619);return(hash>>>0)%2147483646+1};
export const isNative=()=>Capacitor.isNativePlatform();
export async function enableNotifications(){
 const epoch=permissionEpoch;
 let granted=false;
 if(isNative())granted=(await LocalNotifications.requestPermissions()).display==='granted';
 else if('Notification' in window)granted=(await Notification.requestPermission())==='granted';
 else throw new Error('Este navegador no permite notificaciones. Consulta los pendientes en la app.');
 if(epoch!==permissionEpoch)throw new Error('La sesión cambió. Activa los avisos después de iniciar sesión.');
 allowed=granted;
 if(!allowed)throw new Error('No se autorizaron las notificaciones. Puedes habilitarlas en los ajustes de tu dispositivo.');
 return true;
}
export async function syncDeviceNotifications(reminders:Reminder[],plans:MedicationPlan[]){
 if(!allowed)return;
 return queue.run(async current=>{
  if(!current()||!allowed)return;
  const now=Date.now();
  const pending=reminders.filter(r=>!r.completed_at&&!r.cancelled_at);
  const low=plans.filter(p=>p.active&&medicationForecast(p).lowStock);
  if(isNative()){
   const notifications=pending.filter(r=>new Date(r.due_at).getTime()>now).map(r=>({id:notificationId('reminder:'+r.id),title:'La Casa del Ángel',body:'Revisa tus cuidados pendientes en el portal privado.',schedule:{at:new Date(r.due_at)}}));
   for(const plan of plans.filter(p=>p.active)){
    const forecast=medicationForecast(plan);
    if(forecast.lowStockAt){const at=new Date(forecast.lowStockAt);if(at.getTime()>now)notifications.push({id:notificationId('stock:'+plan.id),title:'La Casa del Ángel',body:'Revisa las existencias y la reposición de medicamentos en el portal.',schedule:{at}});}
   }

   const previous=await LocalNotifications.getPending();
   if(!current()||!allowed)return;
   if(previous.notifications.length)await LocalNotifications.cancel({notifications:previous.notifications.map(n=>({id:n.id}))});
   if(!current()||!allowed)return;
   if(notifications.length>50)throw new Error('Se cancelaron los avisos anteriores. Este dispositivo admite hasta 50 avisos programados; reduce tus recordatorios y revisa los demás pendientes en el portal.');
   if(notifications.length)await LocalNotifications.schedule({notifications});
  }
  const alerts=[...pending.filter(r=>new Date(r.due_at).getTime()<=now).map(r=>'reminder:'+r.id),...low.map(p=>'stock:'+p.id+':'+p.stock_remaining)];
  for(const id of alerts){
   if(!current()||!allowed)return;
   if(shown.has(id))continue;
   if(isNative())await LocalNotifications.schedule({notifications:[{id:notificationId(id),title:'La Casa del Ángel',body:'Tienes pendientes para revisar en el portal privado.'}]});
   else new Notification('La Casa del Ángel',{body:'Tienes cuidados o medicamentos pendientes de revisar en el portal privado.',tag:id});
   if(current()&&allowed)shown.add(id);
  }
 });
}
export async function clearDeviceNotifications(){
 allowed=false;permissionEpoch++;shown.clear();
 return queue.run(async current=>{
  if(!isNative())return;
  const pending=await LocalNotifications.getPending();
  if(current()&&pending.notifications.length)await LocalNotifications.cancel({notifications:pending.notifications.map(n=>({id:n.id}))});
 });
}

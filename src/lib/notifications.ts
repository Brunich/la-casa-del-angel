import {Capacitor} from '@capacitor/core';
import {LocalNotifications} from '@capacitor/local-notifications';
import type {MedicationPlan,Reminder} from '../domain';
import {medicationForecast} from '../domain';
import {NotificationQueue} from './notification-queue';
import {webNotificationOptions} from './web-notification-options';
let allowed=false,permissionEpoch=0;
const shown=new Set<string>();
const queue=new NotificationQueue();
let webRegistration:ServiceWorkerRegistration|null=null;
async function prepareWebNotifications(){
 const registration=await navigator.serviceWorker.register('/notifications-sw.js',{scope:'/',updateViaCache:'none'});
 if(!registration.active){
  const worker=registration.installing??registration.waiting;
  if(!worker)throw new Error('No se pudo activar el servicio de avisos. Revisa la conexión e intenta de nuevo.');
  await new Promise<void>((resolve,reject)=>{
   const cleanup=()=>{clearTimeout(timer);worker.removeEventListener('statechange',changed)};
   const changed=()=>{if(worker.state==='activated'){cleanup();resolve()}else if(worker.state==='redundant'){cleanup();reject(new Error('No se pudo activar el servicio de avisos. Intenta de nuevo.'))}};
   const timer=setTimeout(()=>{cleanup();reject(new Error('El servicio de avisos tardó demasiado. Revisa la conexión e intenta de nuevo.'))},15000);
   worker.addEventListener('statechange',changed);changed();
  });
 }
 return registration;
}
const notificationId=(value:string)=>{let hash=2166136261;for(const c of value)hash=Math.imul(hash^c.charCodeAt(0),16777619);return(hash>>>0)%2147483646+1};
export const isNative=()=>Capacitor.isNativePlatform();
export async function enableNotifications(){
 const epoch=permissionEpoch;
 let granted=false;
 if(isNative())granted=(await LocalNotifications.requestPermissions()).display==='granted';
 else if('Notification' in window&&'serviceWorker' in navigator){
  // Request permission directly from the user's click, before any registration awaits.
  granted=(await Notification.requestPermission())==='granted';
  if(granted){try{webRegistration=await prepareWebNotifications()}catch{throw new Error('No se pudo preparar el servicio de avisos. Revisa la conexión y vuelve a activar los avisos.');}}
 }
 else throw new Error('Este navegador no permite estos avisos. En iPhone, añade la web a Inicio con Safari y abre ese icono; consulta los pendientes en el portal.');
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
   else {
    if(!webRegistration?.active)throw new Error('El servicio de avisos no está activo. Vuelve a activar los avisos en el portal.');
    await webRegistration.showNotification('La Casa del Ángel',webNotificationOptions('care-'+notificationId(id)));
   }
   if(current()&&allowed)shown.add(id);
  }
 });
}
export async function clearDeviceNotifications(){
 allowed=false;permissionEpoch++;shown.clear();
 return queue.run(async current=>{
  if(!isNative()){
   if(webRegistration){const notices=await webRegistration.getNotifications();if(current())for(const notice of notices)if(notice.tag.startsWith('care-'))notice.close();}
   return;
  }
  const pending=await LocalNotifications.getPending();
  if(current()&&pending.notifications.length)await LocalNotifications.cancel({notifications:pending.notifications.map(n=>({id:n.id}))});
 });
}

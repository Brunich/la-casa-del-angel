// Notifications only: no fetch handler, offline cache, clinical data or push subscription.
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil((async()=>{
  const portal=new URL('/acceso',self.location.origin).href;
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const existing=windows.find(client=>new URL(client.url).origin===self.location.origin&&new URL(client.url).pathname==='/acceso');
  if(existing){await existing.focus();return;}
  await self.clients.openWindow(portal);
 })());
});

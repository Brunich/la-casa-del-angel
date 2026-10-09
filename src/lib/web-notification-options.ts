// Keep lock-screen notifications generic: no names, treatments, UUIDs or photos.
export function webNotificationOptions(tag:string):NotificationOptions{
 if(!/^care-\d{1,10}$/.test(tag))throw new Error('Identificador de aviso no válido.');
 return {body:'Tienes cuidados o medicamentos pendientes de revisar en el portal privado.',tag,icon:'/icons/icon-192.png'};
}

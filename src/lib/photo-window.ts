export function photoWindow<T extends {photo_path:string|null;occurred_at:string}>(events:readonly T[],now=new Date()){
 const lower=now.getTime()-7*86400000,upper=now.getTime()+300000;
 const photos=events.filter(e=>e.photo_path&&Number.isFinite(new Date(e.occurred_at).getTime())&&new Date(e.occurred_at).getTime()<=upper);
 return{recent:photos.filter(e=>new Date(e.occurred_at).getTime()>=lower),archived:photos.filter(e=>new Date(e.occurred_at).getTime()<lower)};
}

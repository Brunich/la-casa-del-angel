export type HistoryView='care'|'incidents'|'photos';
export function selectCareHistory<T extends {kind:string;photo_path:string|null}>(events:readonly T[],view:HistoryView,filter='all'){
 return events.filter(event=>(view==='incidents'?event.kind==='incident':view==='care'?event.kind!=='incident':Boolean(event.photo_path))&&(filter==='all'||event.kind===filter));
}

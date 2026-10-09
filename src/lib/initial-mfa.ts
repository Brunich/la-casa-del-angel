export function needsInitialMfa(role:string,factors:{status:string}[]){
 return ['owner','manager','nurse'].includes(role)&&!factors.some(f=>f.status==='verified');
}

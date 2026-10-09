export const PRIVATE_IDLE_MS=15*60*1000;
export function sessionExpired(lastActivity:number,now=Date.now()){return!Number.isFinite(lastActivity)||!Number.isFinite(now)||now<lastActivity||now-lastActivity>=PRIVATE_IDLE_MS}

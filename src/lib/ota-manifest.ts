export interface OtaManifest{
 appId:string;platform:'android';version:string;minNativeBuild:number;maxNativeBuild:number;
 url:string;sha256:string;checksum:string;sessionKey:string;
}
const LIMIT=64*1024;
const ERROR='No se pudo verificar la actualización. Conserva la versión instalada.';
function invalid():never{throw new Error(ERROR)}
function record(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))invalid();return value as Record<string,unknown>}
function exactKeys(value:Record<string,unknown>,keys:string[]){const actual=Object.keys(value);if(actual.length!==keys.length||!keys.every(key=>Object.hasOwn(value,key)))invalid()}
function base64(value:unknown):Uint8Array<ArrayBuffer>{
 if(typeof value!=='string'||!value||value.length%4!==0||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))invalid();
 const binary=atob(value);if(btoa(binary)!==value)invalid();return Uint8Array.from(binary,c=>c.charCodeAt(0));
}
function version(value:unknown):number[]{
 if(typeof value!=='string'||! /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value))invalid();
 const parts=value.split('.').map(Number);if(parts.some(part=>!Number.isSafeInteger(part)))invalid();return parts;
}
function payloadPolicy(value:unknown,nativeBuild:number):OtaManifest{
 const p=record(value);exactKeys(p,['appId','platform','version','minNativeBuild','maxNativeBuild','url','sha256','checksum','sessionKey']);
 if(p.appId!=='mx.lacasadelangel.cuidados'||p.platform!=='android')invalid();version(p.version);
 if(!Number.isSafeInteger(nativeBuild)||nativeBuild<1||!Number.isSafeInteger(p.minNativeBuild)||!Number.isSafeInteger(p.maxNativeBuild))invalid();
 const min=p.minNativeBuild as number,max=p.maxNativeBuild as number;
 if(min<1||max<min||nativeBuild<min||nativeBuild>max)invalid();
 if(typeof p.url!=='string'||! /^https:\/\/la-casa-del-angel\.vercel\.app\/updates\/bundles\/[A-Za-z0-9_-][A-Za-z0-9._-]*\.zip$/.test(p.url))invalid();
 if(typeof p.sha256!=='string'||! /^[a-f0-9]{64}$/.test(p.sha256)||typeof p.checksum!=='string'||! /^[a-f0-9]{512}$/.test(p.checksum))invalid();
 if(typeof p.sessionKey!=='string')invalid();const session=p.sessionKey.split(':');if(session.length!==2||base64(session[0]).byteLength!==16||base64(session[1]).byteLength!==256)invalid();
 return p as unknown as OtaManifest;
}
/** Authenticate exact UTF-8 payload bytes before accepting any download metadata. No IO or SDK calls. */
export async function verifyOtaManifest(input:unknown,publicKeySpki:string,currentVersion:string,nativeBuild:number):Promise<OtaManifest|null>{
 try{
  const text=typeof input==='string'?input:JSON.stringify(input);
  if(typeof text!=='string'||new TextEncoder().encode(text).byteLength>LIMIT)invalid();
  const envelope=record(JSON.parse(text));exactKeys(envelope,['payload','signature']);
  const bytes=base64(envelope.payload),signature=base64(envelope.signature);if(signature.byteLength!==256)invalid();
  if(typeof publicKeySpki!=='string'||!publicKeySpki.startsWith('-----BEGIN PUBLIC KEY-----')||!publicKeySpki.trimEnd().endsWith('-----END PUBLIC KEY-----'))invalid();
  const der=base64(publicKeySpki.replace('-----BEGIN PUBLIC KEY-----','').replace('-----END PUBLIC KEY-----','').replace(/\s/g,''));
  const key=await crypto.subtle.importKey('spki',der,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  if((key.algorithm as RsaKeyAlgorithm).modulusLength!==2048||!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,signature,bytes))invalid();
  const manifest=payloadPolicy(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),nativeBuild);
  const next=version(manifest.version),current=version(currentVersion);
  for(let i=0;i<3;i++){if(next[i]>current[i])return manifest;if(next[i]<current[i])return null;}
  return null;
 }catch{throw new Error(ERROR)}
}

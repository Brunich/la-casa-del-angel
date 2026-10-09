import {useEffect,useRef,useState,type ReactNode} from 'react';
import {LockKeyhole} from 'lucide-react';
import {sessionExpired} from './lib/session-policy';
import {ACTIVITY_STORAGE_KEY} from './lib/session-storage';
import {supabase} from './lib/api';
import {clearDeviceNotifications} from './lib/notifications';
export function SessionGuard({children,onExpired}:{children:ReactNode;onExpired:()=>void}){
 const activity=useRef(Number(sessionStorage.getItem(ACTIVITY_STORAGE_KEY)??NaN)),closing=useRef(false);
 const[hidden,setHidden]=useState(document.hidden);
 useEffect(()=>{
  const expire=()=>{if(closing.current)return;closing.current=true;onExpired();void clearDeviceNotifications().catch(()=>{});void supabase?.auth.signOut({scope:'local'});};
  const check=()=>{if(sessionExpired(activity.current))expire()};
  const touch=()=>{check();if(!closing.current){activity.current=Date.now();sessionStorage.setItem(ACTIVITY_STORAGE_KEY,String(activity.current))}};
  const visibility=()=>{setHidden(document.hidden);check()};
  check();const timer=setInterval(check,10000);
  document.addEventListener('pointerdown',touch);document.addEventListener('keydown',touch);document.addEventListener('visibilitychange',visibility);
  return()=>{clearInterval(timer);document.removeEventListener('pointerdown',touch);document.removeEventListener('keydown',touch);document.removeEventListener('visibilitychange',visibility)};
 },[onExpired]);
 return <><div aria-hidden={hidden} className={hidden?'private-hidden':''}>{children}</div>{hidden&&<div className="privacy-cover" role="status"><LockKeyhole size={40}/><h2>La Casa del Ángel</h2><p>Tu información permanece privada.</p></div>}</>;
}

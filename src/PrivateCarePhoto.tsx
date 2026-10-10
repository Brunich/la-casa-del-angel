import {useEffect,useRef,useState} from 'react';
import {ImageIcon,Maximize2} from 'lucide-react';
import {downloadPhoto,supabase} from './lib/api';
import {PhotoViewer} from './PhotoViewer';
import './care-history.css';

/** Authenticated blob URLs live only while this authorized view is mounted. */
export function PrivateCarePhoto({path,caption}:{path:string;caption:string}){
 const actor=useRef(supabase).current,container=useRef<HTMLDivElement>(null);
 const[near,setNear]=useState(false),[visible,setVisible]=useState(!document.hidden);
 const[src,setSrc]=useState(''),[error,setError]=useState(''),[retry,setRetry]=useState(0),[open,setOpen]=useState(false);
 useEffect(()=>{
  const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){setNear(true);observer.disconnect();}},{rootMargin:'200px'});
  if(container.current)observer.observe(container.current);
  return()=>observer.disconnect();
 },[]);
 useEffect(()=>{const change=()=>{setVisible(!document.hidden);if(document.hidden)setOpen(false);};document.addEventListener('visibilitychange',change);return()=>document.removeEventListener('visibilitychange',change);},[]);
 useEffect(()=>{
  let cancelled=false,url='';setSrc('');setError('');setOpen(false);
  if(near&&visible)void downloadPhoto(path,actor).then(value=>{
   if(cancelled){URL.revokeObjectURL(value);return;}url=value;setSrc(value);
  }).catch(cause=>{if(!cancelled)setError(cause instanceof Error?cause.message:'No se pudo cargar esta fotografía.');});
  return()=>{cancelled=true;if(url)URL.revokeObjectURL(url);};
 },[path,actor,near,visible,retry]);
 return <div className="private-care-photo" ref={container}>
  {src?<button type="button" className="care-photo-preview" onClick={()=>setOpen(true)} aria-label="Ampliar fotografía del cuidado"><img src={src} alt={caption} decoding="async"/><span><Maximize2 size={16} aria-hidden="true"/>Ampliar</span></button>:error?<div className="care-photo-status"><p role="alert">{error}</p><button type="button" className="text-link" onClick={()=>setRetry(value=>value+1)}>Volver a cargar foto</button></div>:<p className="care-photo-status" role="status"><ImageIcon size={20} aria-hidden="true"/>{near?'Cargando fotografía privada…':'Fotografía del cuidado'}</p>}
  {open&&src&&<PhotoViewer src={src} caption={caption} onClose={()=>setOpen(false)}/>}
 </div>;
}

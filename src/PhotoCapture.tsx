import {useEffect,useRef,useState} from 'react';
import {Camera,ZoomIn,ZoomOut,Trash2} from 'lucide-react';
import {compressCarePhoto,type PreparedCarePhoto} from './lib/photo-policy';

interface PhotoCaptureProps{
 required:boolean;
 disabled:boolean;
 onPrepared:(photo:PreparedCarePhoto|null)=>void;
 onPreparing:(preparing:boolean)=>void;
 onProblem:(problem:boolean)=>void;
}

// The preview and the upload use this same immutable JPEG Blob. No original upload.
export function PhotoCapture({required,disabled,onPrepared,onPreparing,onProblem}:PhotoCaptureProps){
 const [photo,setPhoto]=useState<PreparedCarePhoto|null>(null);
 const [url,setUrl]=useState(''),[error,setError]=useState(''),[preparing,setPreparing]=useState(false),[expanded,setExpanded]=useState(false),[confirmed,setConfirmed]=useState(false);
 const generation=useRef(0),previewUrl=useRef(''),input=useRef<HTMLInputElement>(null);
 useEffect(()=>()=>{generation.current++;if(previewUrl.current)URL.revokeObjectURL(previewUrl.current);},[]);

 function resetPreview(){
  if(previewUrl.current)URL.revokeObjectURL(previewUrl.current);
  previewUrl.current='';setUrl('');setPhoto(null);setConfirmed(false);setExpanded(false);onPrepared(null);
 }
 async function prepare(file:File|null){
  const ticket=++generation.current;resetPreview();setError('');onProblem(false);setPreparing(!!file);onPreparing(!!file);
  if(!file)return;
  try{
   const prepared=await compressCarePhoto(file);
   if(ticket!==generation.current)return;
   const nextUrl=URL.createObjectURL(prepared.blob);previewUrl.current=nextUrl;setUrl(nextUrl);setPhoto(prepared);onPrepared(prepared);
  }catch(err){if(ticket===generation.current){setError((err as Error).message);onProblem(true);}}
  finally{if(ticket===generation.current){setPreparing(false);onPreparing(false);}}
 }
 function remove(){if(disabled)return;void prepare(null);if(input.current)input.current.value='';}

 return <div className="photo-capture">
  <label className="photo-input"><Camera size={22}/><span>Fotografía del cuidado{required?' · requerida':''}<small>Toma la foto con buena luz, sin imágenes íntimas.</small></span><input ref={input} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={disabled} required={required} onChange={e=>void prepare(e.target.files?.[0]??null)}/></label>
  {preparing&&<p className="message" role="status">Preparando la foto en este dispositivo…</p>}
  {error&&<div className="message error" role="alert"><p>{error}</p><button type="button" className="text-link" disabled={disabled} onClick={remove}>Quitar esta selección</button></div>}
  {photo&&url&&<figure className="photo-review">
   <div className={expanded?'photo-review-image expanded':'photo-review-image'}><img src={url} alt="Vista previa de la fotografía que se enviará" style={expanded?{width:photo.width,maxWidth:'none'}:undefined}/></div>
   <figcaption>Foto preparada: {photo.width} × {photo.height} px · {Math.ceil(photo.blob.size/1024)} KiB. Se enviará esta versión.</figcaption>
   <div className="photo-review-actions"><button type="button" className="button outline" disabled={disabled} aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?<ZoomOut size={18}/>:<ZoomIn size={18}/>} {expanded?'Ver completa':'Ampliar para revisar'}</button><button type="button" className="text-link" disabled={disabled} onClick={remove}><Trash2 size={18}/> Elegir otra foto</button></div>
   <label className="checkbox"><input type="checkbox" required checked={confirmed} disabled={disabled} onChange={e=>setConfirmed(e.target.checked)}/> La foto está enfocada, se ve el cuidado y protege la intimidad. Si muestra un medicamento, su etiqueta se lee.</label>
  </figure>}
  <p className="caption">La foto se comprime antes de enviarla y se elimina su ubicación. Si está borrosa, toma otra; la compresión no corrige el enfoque.</p>
 </div>;
}

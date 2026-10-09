import {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {PhotoCapture} from '../../src/PhotoCapture';
import type {PreparedCarePhoto} from '../../src/lib/photo-policy';
import '../../src/styles.css';
import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-600.css';

// Isolated component verification: real browser codec, no Auth, clinical data or upload.
function PhotoCheck(){
 const[photo,setPhoto]=useState<PreparedCarePhoto|null>(null),[busy,setBusy]=useState(false),[problem,setProblem]=useState(false),[submitted,setSubmitted]=useState(false);
 const[download,setDownload]=useState('');
 useEffect(()=>{const nextUrl=photo?URL.createObjectURL(photo.blob):'';setDownload(nextUrl);return()=>{if(nextUrl)URL.revokeObjectURL(nextUrl)}},[photo]);
 return <main className="legal-page"><h1>Verificación local de fotografías</h1><p>Este control usa la compresión y vista previa del producto. No se envía ningún archivo ni se usa un expediente.</p><form onSubmit={e=>{e.preventDefault();setSubmitted(true)}}><PhotoCapture required disabled={false} onPrepared={p=>{setSubmitted(false);setPhoto(p)}} onPreparing={setBusy} onProblem={setProblem}/><button className="button" disabled={busy||problem}>Comprobar confirmación</button>{submitted&&<p role="status">La fotografía y su confirmación son válidas para enviar.</p>}</form>{photo&&download&&<p><a href={download} download="foto-comprimida-prueba.jpg">Descargar JPEG preparado para inspección</a></p>}</main>;
}
createRoot(document.getElementById('root')!).render(<PhotoCheck/>);

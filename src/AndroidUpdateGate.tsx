import {Component,useEffect,useState,type ReactNode} from 'react';
import {Capacitor} from '@capacitor/core';
import {CapacitorUpdater} from '@capgo/capacitor-updater';
import {RefreshCw,ShieldCheck} from 'lucide-react';
import packageInfo from '../package.json';
import {LoadingScreen} from './LoadingScreen';
import {OTA_ENABLED,OTA_NATIVE_BUILD,OTA_PUBLIC_KEY_SPKI} from './lib/ota-public-key';
import {verifyOtaManifest} from './lib/ota-manifest';
import './android-update.css';

const manifestUrl='https://la-casa-del-angel.vercel.app/updates/latest.json';
const maxManifestBytes=64*1024;
type Stage='checking'|'downloading'|'installing'|'ready'|'error';

// A newly installed bundle must render its real app before acknowledging success.
// React errors prevent acknowledgement; the native watchdog restores the previous bundle.
class FirstBundleStartup extends Component<{children:ReactNode},{failed:boolean}>{
 state={failed:false};private frame=0;private failed=false;
 static getDerivedStateFromError(){return{failed:true};}
 componentDidCatch(){this.failed=true;}
 componentDidMount(){this.frame=requestAnimationFrame(()=>{if(!this.failed)void CapacitorUpdater.notifyAppReady().catch(()=>this.setState({failed:true}));});}
 componentWillUnmount(){cancelAnimationFrame(this.frame);}
 render(){return this.state.failed?<LoadingScreen title="No se pudo abrir esta versión" message="La app recuperará la versión anterior. Espera y vuelve a abrirla."/>:this.props.children;}
}

async function readManifest(response:Response,signal:AbortSignal){
 const contentLength=response.headers.get('content-length');
 if(contentLength&&Number(contentLength)>maxManifestBytes)throw new Error('MANIFEST_TOO_LARGE');
 if(!response.body)throw new Error('MANIFEST_EMPTY');
 const reader=response.body.getReader();const chunks:Uint8Array[]=[];let total=0;
 try{
  while(true){
   if(signal.aborted)throw new Error('UPDATE_CANCELLED');
   const{done,value}=await reader.read();if(done)break;
   total+=value.byteLength;
   if(total>maxManifestBytes)throw new Error('MANIFEST_TOO_LARGE');
   chunks.push(value);
  }
 }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 const bytes=new Uint8Array(total);let offset=0;
 for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
}

// Mount outside React.StrictMode: one startup check, before rendering clinical views.
export function AndroidUpdateGate({children}:{children:ReactNode}){
 const enabled=OTA_ENABLED&&Capacitor.isNativePlatform()&&Capacitor.getPlatform()==='android';
 const[stage,setStage]=useState<Stage>(enabled?'checking':'ready');
 const[canUseInstalled,setCanUseInstalled]=useState(false);
 const[firstBundle,setFirstBundle]=useState(false);
 useEffect(()=>{
  if(!enabled)return;
  let alive=true;const controller=new AbortController();let installedReady=false;
  const timeout=setTimeout(()=>controller.abort(),20000);
  async function check(){
   try{
    const current=await CapacitorUpdater.current();
    if(!alive)return;
    if(current.bundle.id!=='builtin'&&current.bundle.version!==packageInfo.version)throw new Error('BUNDLE_VERSION_MISMATCH');
    if(current.bundle.id!=='builtin'&&current.bundle.status!=='success'){
     setFirstBundle(true);setStage('ready');return;
    }
    installedReady=true;
    const response=await fetch(manifestUrl,{cache:'no-store',credentials:'omit',redirect:'error',signal:controller.signal});
    if(!response.ok)throw new Error('MANIFEST_UNAVAILABLE');
    const input=await readManifest(response,controller.signal);
    const manifest=await verifyOtaManifest(input,OTA_PUBLIC_KEY_SPKI,current.bundle.id==='builtin'?packageInfo.version:current.bundle.version,OTA_NATIVE_BUILD);
    clearTimeout(timeout);
    if(!alive)return;
    if(!manifest){setStage('ready');return;}
    setStage('downloading');
    const bundle=await CapacitorUpdater.download({url:manifest.url,version:manifest.version,checksum:manifest.checksum,sessionKey:manifest.sessionKey});
    if(!alive)return;
    if(bundle.version!==manifest.version)throw new Error('DOWNLOAD_VERSION_MISMATCH');
    setStage('installing');
    await CapacitorUpdater.set({id:bundle.id});
   }catch{
    if(alive){setCanUseInstalled(installedReady);setStage('error');}
   }finally{clearTimeout(timeout);}
  }
  void check();
  return()=>{alive=false;clearTimeout(timeout);controller.abort();};
 },[enabled]);
 if(!enabled||stage==='ready')return firstBundle?<FirstBundleStartup>{children}</FirstBundleStartup>:<>{children}</>;
 if(stage==='error')return <main id="contenido" className="android-update-error app-native"><section><ShieldCheck size={38} aria-hidden="true"/><h1>No se pudo confirmar la actualización</h1><p className="message error" role="alert">La revisión de la versión no terminó correctamente. No se abrió ningún expediente. Reintenta con conexión o consulta a la residencia si el problema continúa.</p><div className="actions"><button className="button" type="button" onClick={()=>location.reload()}><RefreshCw size={18} aria-hidden="true"/> Reintentar</button>{canUseInstalled&&<button className="button outline" type="button" onClick={()=>setStage('ready')}>Usar versión instalada</button>}</div>{canUseInstalled&&<p className="caption">Esta opción abre la versión instalada que se comprobó al iniciar. No instala la actualización pendiente.</p>}</section></main>;
 return <LoadingScreen title={stage==='downloading'?'Descargando actualización':stage==='installing'?'Aplicando actualización':'Revisando la versión de la app'} message={stage==='checking'?'Comprobando la versión antes de abrir tu espacio.':'Espera a que termine antes de entrar al portal.'}/>;
}

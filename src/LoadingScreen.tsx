import {isAppDisplay} from './lib/app-display';
import {HeartHandshake,LoaderCircle} from 'lucide-react';

export function LoadingScreen({title='Preparando tu espacio',message='Consultando el acceso y la información autorizada.'}:{title?:string;message?:string}){
 return <section aria-label="Estado de carga" className={`loading-screen${isAppDisplay()?' app-native':''}`} aria-busy="true"><div className="loading-screen-content"><HeartHandshake className="loading-brand" size={48} strokeWidth={1.4} aria-hidden="true"/><p className="loading-brand-name">La Casa del Ángel</p><div className="loading-state" role="status" aria-live="polite"><LoaderCircle className="spin" size={26} aria-hidden="true"/><h1>{title}</h1><p>{message}</p></div></div></section>;
}

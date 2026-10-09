import {useState,useEffect,useCallback} from 'react';
import {PublicSite} from './PublicSite';
import {Install} from './Install';
import {Login} from './Login';
import {Legal} from './Legal';
import {Portal} from './Portal';
import {supabase} from './lib/api';
import {SessionGuard} from './SessionGuard';
import {AccountSetup,Recovery} from './Account';
import {LoadingScreen} from './LoadingScreen';
import {authErrorMessage} from './lib/auth-errors';
export default function App(){
 const[authenticated,setAuthenticated]=useState(false),[checking,setChecking]=useState(location.pathname==='/acceso'&&!!supabase);
 const[sessionError,setSessionError]=useState('');
 const expire=useCallback(()=>setAuthenticated(false),[]);
 useEffect(()=>{if(!supabase){setChecking(false);return;}let alive=true;supabase.auth.getSession().then(({data,error})=>{if(error)throw error;if(alive){setAuthenticated(!!data.session);setChecking(false)}}).catch(error=>{if(alive){setSessionError(authErrorMessage(error,'login'));setChecking(false)}});const{data}=supabase.auth.onAuthStateChange((_event,session)=>{if(alive)setAuthenticated(!!session)});return()=>{alive=false;data.subscription.unsubscribe()}},[]);
 if(location.pathname==='/instalar')return <Install/>;
 if(location.pathname==='/cuenta')return <AccountSetup/>;
 if(location.pathname==='/recuperar')return <Recovery/>;
 if(location.pathname==='/privacidad'||location.pathname==='/terminos')return <Legal kind={location.pathname==='/privacidad'?'privacy':'terms'}/>;
 if(location.pathname==='/acceso'&&sessionError)return <main id="contenido" className="mfa-page"><section className="form-panel"><h1>No pudimos comprobar tu sesión</h1><p className="message error" role="alert">{sessionError}</p><button className="button" type="button" onClick={()=>location.reload()}>Volver a comprobar</button></section></main>;
 if(location.pathname==='/acceso')return checking?<LoadingScreen title="Preparando tu acceso" message="Comprobando si tu sesión sigue activa."/>:authenticated?<SessionGuard onExpired={expire}><Portal onLogout={expire}/></SessionGuard>:<Login onLogin={()=>setAuthenticated(true)}/>;
 return <PublicSite/>;
}

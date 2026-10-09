import {useState,useEffect,useCallback} from 'react';
import {PublicSite} from './PublicSite';
import {Install} from './Install';
import {Login} from './Login';
import {Legal} from './Legal';
import {Portal} from './Portal';
import {supabase} from './lib/api';
import {SessionGuard} from './SessionGuard';
import {AccountSetup,Recovery} from './Account';
export default function App(){
 const[authenticated,setAuthenticated]=useState(false),[checking,setChecking]=useState(location.pathname==='/acceso'&&!!supabase);
 const expire=useCallback(()=>setAuthenticated(false),[]);
 useEffect(()=>{if(!supabase){setChecking(false);return;}let alive=true;supabase.auth.getSession().then(({data})=>{if(alive){setAuthenticated(!!data.session);setChecking(false)}});const{data}=supabase.auth.onAuthStateChange((_event,session)=>{if(alive)setAuthenticated(!!session)});return()=>{alive=false;data.subscription.unsubscribe()}},[]);
 if(location.pathname==='/instalar')return <Install/>;
 if(location.pathname==='/cuenta')return <AccountSetup/>;
 if(location.pathname==='/recuperar')return <Recovery/>;
 if(location.pathname==='/privacidad'||location.pathname==='/terminos')return <Legal kind={location.pathname==='/privacidad'?'privacy':'terms'}/>;
 if(location.pathname==='/acceso')return checking?<main className="loading" role="status">Verificando acceso…</main>:authenticated?<SessionGuard onExpired={expire}><Portal onLogout={expire}/></SessionGuard>:<Login onLogin={()=>setAuthenticated(true)}/>;
 return <PublicSite/>;
}

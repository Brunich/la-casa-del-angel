import {useEffect,useState,type FormEvent} from 'react';
import {Capacitor} from '@capacitor/core';
import {MailCheck,UserPlus} from 'lucide-react';
import {accountRecoveryRedirect,passwordIssues} from './lib/account-link';
import {createAccount,getRegistrationSites,type RegistrationSite} from './lib/registration-api';
import {LoadingScreen} from './LoadingScreen';

export function Signup({onSignIn}:{onSignIn:()=>void}){
 const[name,setName]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[confirmation,setConfirmation]=useState('');
 const[busy,setBusy]=useState(false),[error,setError]=useState(''),[sent,setSent]=useState(false);
 const[sites,setSites]=useState<RegistrationSite[]>([]),[siteId,setSiteId]=useState(''),[sitesLoading,setSitesLoading]=useState(true),[sitesError,setSitesError]=useState(''),[revision,setRevision]=useState(0);
 useEffect(()=>{
  let alive=true;setSitesLoading(true);setSitesError('');
  getRegistrationSites().then(result=>{if(alive)setSites(result)}).catch(()=>{if(alive)setSitesError('No se pudieron consultar las sedes. Puedes volver a intentar o registrar la cuenta sin sede para que Dirección general revise tu solicitud.');}).finally(()=>{if(alive)setSitesLoading(false)});
  return()=>{alive=false};
 },[revision]);
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy)return;
  const issues=passwordIssues(password,confirmation);
  if(!name.trim()||name.trim().length>160)issues.unshift('Escribe tu nombre completo (hasta 160 caracteres).');
  if(issues.length){setError(issues.join(' '));return;}
  setBusy(true);setError('');
  try{
   await createAccount({email:email.trim(),password,confirmation,fullName:name.trim(),siteId:siteId||null},accountRecoveryRedirect(location.origin,Capacitor.isNativePlatform()));
   setPassword('');setConfirmation('');setSent(true);
  }catch(failure){
   setError(failure instanceof Error?failure.message:'No se confirmó el registro. Revisa los datos y la conexión; si ya tienes cuenta, inicia sesión o recupera tu contraseña.');
  }finally{setBusy(false)}
 }
 if(busy)return <LoadingScreen title="Solicitando registro" message="Preparando tu solicitud de cuenta."/>;
 if(sent)return <div className="signup-confirmation"><MailCheck size={32} aria-hidden="true"/><h2>Revisa tu correo</h2><p className="message" role="status">Si tu correo puede registrarse, recibirás un enlace para confirmar la cuenta. Revisa también spam. Después de confirmar, la residencia debe asignarte un rol y los accesos autorizados.</p><p>Crear la cuenta no da acceso a expedientes. Puedes iniciar sesión para comprobar si tu autorización ya está lista.</p><button type="button" className="button full" onClick={onSignIn}>Ir a iniciar sesión</button></div>;
 return <><UserPlus size={28} aria-hidden="true"/><h2>Crea tu cuenta</h2><p>Confirma tu correo y espera la autorización de la residencia para entrar a los expedientes.</p><form className="signup-form" onSubmit={submit} aria-busy={busy}><fieldset disabled={busy}>
  <label>Nombre completo<input value={name} onChange={e=>setName(e.target.value)} autoComplete="name" required maxLength={160}/></label>
  <label>Correo electrónico<input type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" required maxLength={254}/></label>
  <label>Sede que te corresponde (opcional)<select value={siteId} onChange={e=>setSiteId(e.target.value)} disabled={sitesLoading} aria-describedby="signup-site-help"><option value="">No sé mi sede</option>{sites.map(site=><option key={site.id} value={site.id}>{site.name}</option>)}</select></label>
  {sitesLoading&&<p className="caption" role="status">Consultando sedes…</p>}
  {sitesError&&<div className="message warning" role="alert"><p>{sitesError}</p><button type="button" className="text-link" onClick={()=>setRevision(r=>r+1)}>Volver a consultar sedes</button></div>}
  <p id="signup-site-help" className="caption">{siteId?'El equipo autorizado de esta sede revisará tu solicitud. Elegirla no da acceso a expedientes.':'Si registras la cuenta sin sede, Dirección general revisará tu solicitud. Puedes continuar aunque todavía no se haya publicado una sede.'}</p>
  <label>Contraseña<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password" required minLength={12} maxLength={72} aria-describedby="signup-password-help"/></label>
  <label>Repite la contraseña<input type="password" value={confirmation} onChange={e=>setConfirmation(e.target.value)} autoComplete="new-password" required minLength={12} maxLength={72}/></label>
  <p id="signup-password-help" className="caption">Usa al menos 12 caracteres, hasta 72 sin acentos; los símbolos ocupan más espacio. Una frase larga suele ser más fácil de recordar. Las contraseñas deben coincidir.</p>
  {error&&<p className="message error" role="alert">{error}</p>}
  <button className="button full" type="submit">{busy?'Solicitando registro…':'Crear cuenta y verificar correo'}</button>
 </fieldset></form><button type="button" className="text-link" disabled={busy} onClick={onSignIn}>Ya tengo cuenta · Iniciar sesión</button></>;
}

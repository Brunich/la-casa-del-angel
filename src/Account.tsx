import {useEffect,useState,type FormEvent} from 'react';
import {Capacitor} from '@capacitor/core';
import {ArrowLeft,LockKeyhole} from 'lucide-react';
import {supabase} from './lib/api';
import {parseAccountLink,passwordIssues,accountRecoveryRedirect,type AccountLink} from './lib/account-link';
import {MFA} from './MFA';

export function Recovery(){
 const[email,setEmail]=useState(''),[busy,setBusy]=useState(false),[sent,setSent]=useState(false),[error,setError]=useState('');
 async function submit(event:FormEvent){
  event.preventDefault();if(!supabase||busy)return;setBusy(true);setError('');
  try{const{error:failure}=await supabase.auth.resetPasswordForEmail(email.trim(),{redirectTo:accountRecoveryRedirect(location.origin,Capacitor.isNativePlatform())});if(failure)throw failure;setSent(true);setEmail('');}
  catch{setError('No se pudo solicitar el correo. Espera unos minutos o pide ayuda a un manager.');}finally{setBusy(false)}
 }
 return <main id="contenido" className="mfa-page"><section className="form-panel"><a className="text-link" href="/acceso"><ArrowLeft size={18}/>Volver al acceso</a><LockKeyhole size={30}/><h1>Recupera tu acceso</h1><p>Te enviaremos un enlace para elegir una contraseña nueva.</p>{!supabase?<p className="message">El portal está en preparación. Contacta a un manager para habilitar tu cuenta.</p>:sent?<p className="message" role="status">Si existe una cuenta con ese correo, recibirás un enlace. Revisa también la carpeta de spam. Si no llega, consulta con un manager.</p>:<form onSubmit={submit}><label>Correo de tu cuenta<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} disabled={busy}/></label><button className="button" disabled={busy}>{busy?'Solicitando…':'Enviar enlace'}</button></form>}{error&&<p className="message error" role="alert">{error}</p>}<p className="caption">No compartas el enlace ni tu contraseña.</p></section></main>;
}

export function AccountSetup(){
 const[link]=useState<AccountLink|null>(()=>{try{return parseAccountLink(location.hash)}catch{return null}});
 const[verifiedId,setVerifiedId]=useState(''),[needsMfa,setNeedsMfa]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(false),[sessionWarning,setSessionWarning]=useState('');
 const[password,setPassword]=useState(''),[confirmation,setConfirmation]=useState('');
 useEffect(()=>{history.replaceState(null,'',location.pathname)},[]);
 async function assurance(){if(!supabase)return;const{data,error:failure}=await supabase.auth.mfa.getAuthenticatorAssuranceLevel();if(failure)throw failure;setNeedsMfa(data.nextLevel==='aal2'&&data.currentLevel!=='aal2')}
 async function verify(){
  if(!supabase||!link||busy)return;setBusy(true);setError('');
  try{
   const{error:logoutError}=await supabase.auth.signOut({scope:'local'});if(logoutError)throw logoutError;
   const{data,error:failure}=await supabase.auth.verifyOtp({token_hash:link.tokenHash,type:link.type});if(failure||!data.user||!data.session)throw failure??new Error();
   if(link.type==='signup'||link.type==='email'){
    setDone(true);setVerifiedId('');
    try{const{error:logoutError}=await supabase.auth.signOut({scope:'local'});if(logoutError)throw logoutError;}
    catch{setSessionWarning('Tu correo quedó confirmado, pero no pudimos comprobar el cierre de esta sesión. El acceso a expedientes sigue sujeto a autorización.');}
    return;
   }
   await assurance();setVerifiedId(data.user.id);
  }catch{setVerifiedId('');setError('El enlace no se pudo verificar. Puede haber vencido o usado antes. Solicita uno nuevo.');await supabase.auth.signOut({scope:'local'}).catch(()=>{});}finally{setBusy(false)}
 }
 async function save(event:FormEvent){
  event.preventDefault();if(!supabase||!verifiedId||busy)return;const issues=passwordIssues(password,confirmation);if(issues.length){setError(issues.join(' '));return}setBusy(true);setError('');
  try{
   const{data,error:failure}=await supabase.auth.getUser();if(failure||data.user?.id!==verifiedId)throw failure??new Error();
   const{error:updateError}=await supabase.auth.updateUser({password});if(updateError)throw updateError;
   setPassword('');setConfirmation('');setDone(true);setVerifiedId('');
   try{const{error:revokeError}=await supabase.auth.signOut({scope:'global'});if(revokeError)throw revokeError;}
   catch{setSessionWarning('La contraseña quedó guardada, pero no pudimos confirmar el cierre de otras sesiones. Contacta a un manager si perdiste acceso a un dispositivo.');}
  }catch{setError('No se pudo guardar la contraseña. Revisa los requisitos o solicita un enlace nuevo.');}finally{setBusy(false)}
 }
 if(needsMfa&&!done)return <MFA recovery onVerified={()=>void assurance().catch(()=>setError('No se pudo comprobar la verificación. Intenta de nuevo.'))} onLogout={()=>{void supabase?.auth.signOut({scope:'local'});location.replace('/acceso')}}/>;
 return <main id="contenido" className="mfa-page"><section className="form-panel"><LockKeyhole size={30}/><h1>{(link?.type==='signup'||link?.type==='email')?'Confirma tu correo':link?.type==='invite'?'Activa tu cuenta':'Elige tu contraseña'}</h1>{done?<><p className="message" role="status">{(link?.type==='signup'||link?.type==='email')?'Tu correo quedó confirmado. Tu contraseña ya está lista; la residencia debe asignarte un rol y los accesos autorizados.':'La contraseña quedó guardada. Inicia sesión con ella para entrar.'}</p>{busy&&<p role="status">Comprobando el cierre de otras sesiones…</p>}{sessionWarning&&<p className="message warning" role="alert">{sessionWarning}</p>}<a className="button" href="/acceso">Ir al acceso</a></>:!supabase?<p className="message">El portal está en preparación. Contacta a un manager.</p>:!link?<><p className="message error">Este enlace no es válido. Abre el enlace del correo o solicita uno nuevo.</p><a className="button outline" href="/recuperar">Recuperar acceso</a></>:!verifiedId?<><p>{(link.type==='signup'||link.type==='email')?'Verifica el enlace del correo para confirmar tu cuenta. Después podrás iniciar sesión y comprobar tu autorización.':'Verifica el enlace del correo antes de elegir tu contraseña.'}</p><button className="button" disabled={busy} onClick={()=>void verify()}>{busy?'Verificando…':'Verificar mi enlace'}</button></>:<form onSubmit={save}><label>Nueva contraseña<input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={e=>setPassword(e.target.value)} disabled={busy}/></label><label>Repite la contraseña<input type="password" autoComplete="new-password" required value={confirmation} onChange={e=>setConfirmation(e.target.value)} disabled={busy}/></label><p className="caption">Usa de 12 a 128 caracteres. Una frase larga suele ser más fácil de recordar. No compartas tu cuenta.</p><button className="button" disabled={busy}>{busy?'Guardando…':'Guardar contraseña'}</button></form>}{error&&<p className="message error" role="alert">{error}</p>}</section></main>;
}

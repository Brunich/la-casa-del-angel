type AuthAction='signup'|'login'|'recovery';
// Only controlled messages: never render raw provider errors, emails or internals.
export function authErrorMessage(error:unknown,action:AuthAction):string{
 const value=error&&typeof error==='object'?error as {code?:unknown;status?:unknown;name?:unknown}:{};
 const code=typeof value.code==='string'?value.code:'';
 const status=typeof value.status==='number'?value.status:undefined;
 if(code==='signup_disabled'||code==='email_provider_disabled')return 'El registro de cuentas está desactivado en la configuración de la residencia. Un administrador debe habilitarlo; cambiar tus datos no resolverá este error.';
 if(code==='over_email_send_rate_limit')return 'Se alcanzó el límite de envío de correos. Revisa tu bandeja y spam antes de volver a solicitarlo; espera unos minutos para reintentar.';
 if(code==='over_request_rate_limit'||status===429)return 'Se hicieron demasiados intentos seguidos. Espera unos minutos antes de volver a intentar.';
 if(code==='email_address_not_authorized')return 'El envío de correo necesita una corrección de configuración. Contacta a la residencia para que revise el servicio de correo.';
 if(code==='email_address_invalid'||code==='validation_failed')return 'No se pudo aceptar el registro. Revisa el formato del correo y los campos requeridos.';
 if(code==='weak_password')return 'La contraseña no cumple los requisitos de seguridad. Elige una frase más larga y distinta de contraseñas comunes.';
 if(code==='email_not_confirmed')return 'Primero confirma tu correo con el enlace recibido. Revisa también spam antes de iniciar sesión.';
 if(code==='invalid_credentials')return 'No se pudo iniciar sesión con ese correo y contraseña. Revisa ambos o utiliza Olvidé mi contraseña.';
 if(code==='captcha_failed')return 'No se pudo verificar la comprobación de seguridad. Vuelve a completarla antes de continuar.';
 if(status!==undefined&&status>=500)return 'El servicio de acceso no está disponible en este momento. Puede necesitar una revisión del servidor; intenta más tarde y avisa a la residencia si continúa.';
 if(error instanceof TypeError||value.name==='AuthRetryableFetchError'||status===0)return 'No pudimos conectar con el servicio de acceso. Revisa tu conexión; si otras páginas funcionan, el servicio puede estar temporalmente inaccesible.';
 if(action==='login')return 'No se pudo iniciar sesión. Revisa tus datos y confirma el correo; si el problema continúa, contacta a la residencia.';
 if(action==='recovery')return 'No se pudo solicitar el correo de recuperación. Intenta más tarde o contacta a la residencia si continúa.';
 return 'No se pudo confirmar el registro. Si ya tienes cuenta, inicia sesión o recupera tu contraseña; si el problema continúa, contacta a la residencia.';
}

import {supabase} from './api';
import {parseRegistrationInput,type SelfRegistrationInput} from './registration-input';
import {authErrorMessage} from './auth-errors';
export type {SelfRegistrationInput} from './registration-input';
export interface RegistrationSite{id:string;name:string}
function client(){if(!supabase)throw new Error('El registro aún no está habilitado. Contacta a coordinación.');return supabase;}
export async function getRegistrationSites():Promise<RegistrationSite[]>{
 const sites:RegistrationSite[]=[];
 for(let offset=0;;offset+=500){
  const{data,error}=await client().rpc('get_registration_sites').order('name').order('id').range(offset,offset+499);
  if(error||!data)throw new Error('No se pudieron consultar las sedes. Actualiza antes de crear la cuenta.');
  sites.push(...data as RegistrationSite[]);
  if(data.length<500)return sites;
 }
}
export async function createAccount(input:SelfRegistrationInput,redirectTo:string):Promise<void>{
 const value=parseRegistrationInput(input);
 const{data,error}=await client().auth.signUp({email:value.email,password:value.password,options:{emailRedirectTo:redirectTo,data:{full_name:value.fullName,requested_site_id:value.siteId}}});
 if(error)throw new Error(authErrorMessage(error,'signup'));
 if(data.session){
  const{error:logoutError}=await client().auth.signOut({scope:'local'});
  if(logoutError)throw new Error('No se pudo cerrar la sesión de registro. Cierra esta página y contacta a coordinación.');
  throw new Error('La verificación por correo no está configurada. Contacta a coordinación antes de usar la cuenta.');
 }
}

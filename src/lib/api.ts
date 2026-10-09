import {createClient} from '@supabase/supabase-js';
import {createSessionStorage,AUTH_STORAGE_KEY} from './session-storage';
import {validatePreparedPhoto,type PreparedCarePhoto} from './photo-policy';
import type {CareDraft,CareEvent,MedicationPlan,MedicationMovement,Profile,Resident,Reminder} from '../domain';
const url=import.meta.env.VITE_SUPABASE_URL;
const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const supabase=url&&key?createClient(url,key,{global:{fetch:(input,options)=>fetch(input,{...options,cache:"no-store"})},auth:{persistSession:true,storageKey:AUTH_STORAGE_KEY,storage:createSessionStorage(sessionStorage,()=>Date.now(),AUTH_STORAGE_KEY),autoRefreshToken:true,detectSessionInUrl:false}}):null;
function client(){if(!supabase)throw new Error('El acceso privado aún no está habilitado. Contacta a la residencia.');return supabase}
export class ProfileAccessError extends Error{
 readonly code:'CARE_PROFILE_PENDING'|'CARE_PROFILE_INACTIVE';
 constructor(code:'CARE_PROFILE_PENDING'|'CARE_PROFILE_INACTIVE'){
  super(code==='CARE_PROFILE_PENDING'?'Tu correo está confirmado. Tu cuenta espera aprobación de un Manager o Dirección general.':'Tu acceso no está activo. Contacta a coordinación.');this.code=code;
 }
}
export async function getProfile(){
 const {data:userData,error:userError}=await client().auth.getUser();
 if(userError||!userData.user)throw new Error('Inicia sesión de nuevo.');
 const {data,error}=await client().from('profiles').select('*').eq('id',userData.user.id).maybeSingle();
 if(error)throw new Error('No se pudo consultar tu acceso. Revisa la conexión y vuelve a intentar.');
 if(!data){
  const{data:status,error:statusError}=await client().rpc('get_my_access_status');
  if(statusError)throw new Error('No se pudo comprobar el estado de tu cuenta. Actualiza antes de continuar.');
  if(status==='pending')throw new ProfileAccessError('CARE_PROFILE_PENDING');
  if(status==='inactive')throw new ProfileAccessError('CARE_PROFILE_INACTIVE');
  throw new Error('No se pudo consultar tu perfil autorizado. Contacta a coordinación.');
 }
 if(!data.active)throw new ProfileAccessError('CARE_PROFILE_INACTIVE');
 return data as Profile;
}
export async function getResidents(){const{data,error}=await client().from('residents').select('*').eq('active',true).order('full_name');if(error)throw new Error('No pudimos cargar los residentes. Intenta actualizar.');return(data??[]) as Resident[]}
export async function getTimeline(residentId:string){const{data,error}=await client().rpc('get_resident_timeline',{p_resident_id:residentId});if(error)throw new Error('No pudimos cargar la bitácora. Intenta actualizar.');return(data??[]) as CareEvent[]}
export async function getMedications(residentId:string){const{data,error}=await client().rpc('get_medication_plans',{p_resident_id:residentId});if(error)throw new Error('No pudimos cargar los medicamentos.');return(data??[]) as MedicationPlan[]}
export async function getAccessibleMedications(){const{data,error}=await client().rpc('get_accessible_medication_plans');if(error)throw new Error('No se pudo revisar el inventario autorizado.');return(data??[]) as MedicationPlan[]}
export async function getMovements(residentId:string){const{data,error}=await client().rpc('get_medication_movements',{p_resident_id:residentId});if(error)throw new Error('No se pudo cargar el historial de existencias.');return(data??[]) as MedicationMovement[]}
export async function cancelReminder(id:string){const{error}=await client().rpc('cancel_reminder',{p_id:id});if(error)throw new Error('No se pudo cancelar el recordatorio. Revisa tus permisos o actualiza la vista.');}
export async function getReminders(){const{data,error}=await client().from('reminders').select('*').order('due_at');if(error)throw new Error('No pudimos cargar los recordatorios.');return(data??[]) as Reminder[]}
export async function saveCare(residentId:string,draft:CareDraft){const{data,error}=await client().rpc('record_care_event',{p_resident_id:residentId,p_kind:draft.kind,p_occurred_at:draft.occurred_at,p_notes:draft.notes,p_details:draft.details,p_photo_path:draft.photo_path??null,p_medication_plan_id:draft.medication_plan_id??null,p_units_taken:draft.units_taken??null});if(error)throw new Error('No se guardó el cuidado. Revisa la pauta, las existencias, los permisos y los campos requeridos; vuelve a intentar.');return data as string}
export async function uploadPhoto(residentId:string,photo:PreparedCarePhoto){
 validatePreparedPhoto(photo);const blob=photo.blob;
 const path=residentId+'/'+crypto.randomUUID()+'.jpg';
 const{error}=await client().storage.from('care-photos').upload(path,blob,{contentType:'image/jpeg',upsert:false});if(error)throw new Error('No se pudo subir la fotografía. Revisa tu conexión y la autorización.');return path;
}
export async function downloadPhoto(path:string){const{data,error}=await client().storage.from('care-photos').download(path);if(error)throw new Error('No se pudo abrir la foto o ya no tienes acceso.');return URL.createObjectURL(data)}
export async function removeDraftPhoto(path:string){const{error}=await client().storage.from('care-photos').remove([path]);if(error)throw new Error('No se pudo cerrar el borrador. Revisa la conexión y vuelve a intentar.');}
export async function addReminder(reminder:Pick<Reminder,'resident_id'|'kind'|'due_at'|'user_id'|'medication_plan_id'>){const{error}=await client().from('reminders').insert(reminder);if(error)throw new Error('No se guardó el recordatorio.');}
export async function addStock(planId:string,units:number,reason:string,requestId:string){const{error}=await client().rpc('register_stock',{p_plan_id:planId,p_units:units,p_reason:reason,p_request_id:requestId});if(error)throw new Error('No se confirmó la reposición. Reintenta el mismo registro para verificarlo sin duplicar existencias.');}
export async function createMedication(plan:Omit<MedicationPlan,'id'|'stock_remaining'>){const{error}=await client().from('medication_plans').insert({...plan,stock_remaining:0});if(error)throw new Error('No se guardó la pauta. Revisa los campos y tus permisos.');}
export async function addResident(resident:Omit<Resident,'id'>){const{error}=await client().from('residents').insert(resident);if(error)throw new Error('No se pudo registrar al residente. Verifica tu sede y los permisos.');}
export async function getSites(){const{data,error}=await client().from('sites').select('id,name').order('name');if(error)throw new Error('No se pudieron cargar las sedes.');return(data??[]) as {id:string;name:string}[]}

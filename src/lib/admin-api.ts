import type {Profile,Role} from '../domain';
export interface AdminAccount{id:string;full_name:string;email:string;role:Role|null;active:boolean;confirmed:boolean;requested_site_id:string|null}
export async function getAdminAccounts():Promise<AdminAccount[]>{
 const{data,error}=await client().rpc('get_admin_accounts');
 if(error)throw new Error('No se pudieron cargar las cuentas autorizadas.');
 return(data??[]) as AdminAccount[];
}
export async function inviteAccount(email:string,fullName:string){
 const{error}=await client().functions.invoke('invite-care-account',{body:{email:email.trim(),full_name:fullName.trim()}});
 if(error){
  if('context' in error&&error.context instanceof Response){const detail=await error.context.json().catch(()=>null);if(detail?.code==='ACCOUNT_EXISTS')throw new Error('Esta persona ya tiene una cuenta. Selecciónala en Sedes y equipo → Cambiar rol del perfil o en Dar de alta cuenta nueva; no necesita otra invitación.');}
  throw new Error('No se confirmó el envío. Revisa la cuenta, la conexión y el límite de invitaciones antes de intentar de nuevo.');
 }
}
import {supabase} from './api';
import {parseAssignmentInput,parseProfileInput,parseSiteName,parseUuid,type AssignmentInput,type ProfileInput} from './admin-input';

export interface ProfileScope{siteId?:string|null;residentId?:string|null;siteIds?:string[];residentIds?:string[]}
export interface SiteAssignments{staff:{user_id:string;site_id:string}[];residents:{user_id:string;resident_id:string}[]}

function client() {
  if(!supabase) throw new Error('El acceso privado aún no está habilitado. Contacta a la residencia.');
  return supabase;
}
export async function getAdminProfiles():Promise<Profile[]> {
  try {
    const {data,error} = await client().from('profiles').select('id,full_name,role,active').order('full_name');
    if(error) throw error;
    return (data ?? []) as Profile[];
  } catch {throw new Error('No se pudieron cargar las cuentas autorizadas. Intenta actualizar.');}
}
export async function getSiteAssignments():Promise<SiteAssignments> {
 async function read<T>(table:'staff_sites'|'resident_access',columns:string,key:'site_id'|'resident_id'):Promise<T[]>{
  const rows:T[]=[];
  for(let offset=0;;offset+=500){
   const{data,error}=await client().from(table).select(columns).order(key).order('user_id').range(offset,offset+499);
   if(error||!data)throw new Error('No se pudieron cargar las asignaciones autorizadas. Actualiza antes de cambiar el acceso.');
   rows.push(...data as T[]);
   if(data.length<500)return rows;
  }
 }
 const [staff,residents]=await Promise.all([
  read<SiteAssignments['staff'][number]>('staff_sites','user_id,site_id','site_id'),
  read<SiteAssignments['residents'][number]>('resident_access','user_id,resident_id','resident_id')
 ]);
 return {staff,residents};
}
export async function manageProfile(input:ProfileInput,actor:Profile,scope:ProfileScope={}):Promise<void> {
  const value = parseProfileInput(input,actor);
  if(value.role==='patient')throw new Error('Selecciona Dirección general, Managers, Enfermería o Familia.');
  const siteIds=[...new Set((scope.siteIds??(scope.siteId?[scope.siteId]:[])).map(parseUuid))];
  const residentIds=[...new Set((scope.residentIds??(scope.residentId?[scope.residentId]:[])).map(parseUuid))];
  if(value.role==='owner'?(siteIds.length>0||residentIds.length>0):(value.active&&siteIds.length===0))throw new Error('Selecciona al menos una sede para activar el perfil; Dirección general tiene acceso global.');
  if((value.role==='manager'&&residentIds.length>0)||(value.role==='family'&&value.active&&residentIds.length===0))throw new Error('Selecciona los residentes autorizados para este perfil.');
  try {
    const {error} = await client().rpc('manage_profile_scopes',{p_user_id:value.userId,p_full_name:value.fullName,p_role:value.role,p_active:value.active,p_site_ids:siteIds,p_resident_ids:residentIds,p_verified:value.verified});
    if(error) throw error;
  } catch {throw new Error('No se confirmó el perfil. Verifica que la cuenta exista en Supabase, el rol y tus permisos; vuelve a intentar.');}
}
export async function assignNurseSector(userId:string,siteId:string,grant:boolean):Promise<void> {
  const account=parseUuid(userId),site=parseUuid(siteId);
  if(typeof grant!=='boolean')throw new Error('Selecciona dar o revocar acceso.');
  try {
    const {error}=await client().rpc('set_nurse_sector_access',{p_user_id:account,p_site_id:site,p_grant:grant});
    if(error)throw error;
  } catch {throw new Error('No se confirmó el acceso al sector. Verifica que Enfermería tenga asignada esta sede y que esté dentro de tus permisos.');}
}
export async function createSite(name:string):Promise<void> {
  const normalized = parseSiteName(name);
  try {
    const {error} = await client().from('sites').insert({name:normalized});
    if(error) throw error;
  } catch {throw new Error('No se confirmó la sede. Actualiza la lista antes de volver a intentar para evitar duplicados.');}
}
export async function setStaffSite(input:AssignmentInput):Promise<void> {
  const value = parseAssignmentInput(input);
  try {
    const {error} = await client().rpc('set_staff_site',{p_user_id:value.userId,p_site_id:value.targetId,p_assigned:value.assigned});
    if(error) throw error;
  } catch {throw new Error('No se confirmó la asignación de sede. Verifica el UUID, que la cuenta de personal esté activa y tus permisos.');}
}
export async function setResidentAccess(input:AssignmentInput):Promise<void> {
  const value = parseAssignmentInput(input);
  try {
    const {error} = await client().rpc('set_resident_access',{p_resident_id:value.targetId,p_user_id:value.userId,p_assigned:value.assigned});
    if(error) throw error;
  } catch {throw new Error('No se confirmó el acceso al residente. Verifica la cuenta activa, su rol, la sede de enfermería y tus permisos.');}
}

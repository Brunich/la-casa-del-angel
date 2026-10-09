import type {Profile, Role} from '../domain';

export interface ProfileInput {userId:string;fullName:string;role:Role;active:boolean;verified:true}
export interface AssignmentInput {userId:string;targetId:string;assigned:boolean;verified:true}
type RawProfileInput = {userId:unknown;fullName:unknown;role:unknown;active:unknown;verified:unknown};
type RawAssignmentInput = {userId:unknown;targetId:unknown;assigned:unknown;verified:unknown};
const roles:Role[] = ['owner','manager','nurse','family','patient'];

export function parseUuid(value:unknown):string {
  if(typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim())) {
    throw new Error('Introduce el UUID completo de la cuenta o asignación.');
  }
  return value.trim().toLowerCase();
}
export function parseSiteName(value:unknown):string {
  const name = typeof value === 'string' ? value.trim() : '';
  if(!name || name.length > 160) throw new Error('El nombre debe tener entre 1 y 160 caracteres.');
  return name;
}
function verified(value:unknown):true {
  if(value !== true) throw new Error('Verifica la identidad y la autorización antes de cambiar el acceso.');
  return true;
}
export function parseProfileInput(input:RawProfileInput,actor:Pick<Profile,'id'|'role'>):ProfileInput {
  if(actor.role !== 'owner') throw new Error('Solo Dirección puede crear o modificar perfiles.');
  const userId = parseUuid(input.userId);
  const fullName = parseSiteName(input.fullName);
  if(typeof input.role !== 'string' || !roles.includes(input.role as Role)) throw new Error('Selecciona un rol válido.');
  if(typeof input.active !== 'boolean') throw new Error('Selecciona si la cuenta está activa.');
  if(userId === actor.id.toLowerCase() && (!input.active || input.role !== 'owner')) {
    throw new Error('Tu propia cuenta debe conservar el rol de Dirección y permanecer activa.');
  }
  return {userId,fullName,role:input.role as Role,active:input.active,verified:verified(input.verified)};
}
export function parseAssignmentInput(input:RawAssignmentInput):AssignmentInput {
  const userId = parseUuid(input.userId);
  const targetId = parseUuid(input.targetId);
  if(typeof input.assigned !== 'boolean') throw new Error('Selecciona asignar o revocar.');
  return {userId,targetId,assigned:input.assigned,verified:verified(input.verified)};
}

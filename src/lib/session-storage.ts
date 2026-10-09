import {sessionExpired} from './session-policy.ts';
export const AUTH_STORAGE_KEY='casa-angel-auth';
export const ACTIVITY_STORAGE_KEY='casa-angel-last-activity';
type SessionStorage=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
export function createSessionStorage(storage:SessionStorage,now=()=>Date.now(),authKey='auth'){
 return {
  getItem(key:string){
   const value=storage.getItem(key);
   if(key===authKey&&value&&sessionExpired(Number(storage.getItem(ACTIVITY_STORAGE_KEY)??NaN),now())){
    storage.removeItem(key);storage.removeItem(ACTIVITY_STORAGE_KEY);return null;
   }
   return value;
  },
  setItem(key:string,value:string){
   if(key===authKey&&!storage.getItem(key))storage.setItem(ACTIVITY_STORAGE_KEY,String(now()));
   storage.setItem(key,value);
  },
  removeItem(key:string){storage.removeItem(key);if(key===authKey)storage.removeItem(ACTIVITY_STORAGE_KEY);}
 };
}

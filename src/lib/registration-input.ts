import {parseUuid,parseSiteName} from './admin-input.ts';
import {passwordIssues} from './account-link.ts';

export interface SelfRegistrationInput{email:string;fullName:string;password:string;confirmation:string;siteId?:string|null}
export function parseRegistrationInput(input:SelfRegistrationInput){
 const email=input.email.trim().toLowerCase();
 if(email.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/u.test(email))throw new Error('Introduce un correo electrónico válido.');
 const issues=passwordIssues(input.password,input.confirmation);
 if(issues.length)throw new Error(issues.join(' '));
 const fullName=parseSiteName(input.fullName);
 const siteId=input.siteId?.trim()?parseUuid(input.siteId):null;
 return{email,fullName,password:input.password,siteId};
}

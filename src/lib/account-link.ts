export type AccountLink={tokenHash:string;type:'invite'|'recovery'|'signup'|'email'};
export function parseAccountLink(fragment:string):AccountLink{
 const params=new URLSearchParams(fragment.replace(/^#/,''));
 const hashes=params.getAll('token_hash'),types=params.getAll('type');
 if(hashes.length!==1||types.length!==1||!hashes[0]||hashes[0].length>1024||/[\s\x00-\x1f\x7f]/u.test(hashes[0])||!['invite','recovery','signup','email'].includes(types[0]))throw new Error('Enlace no válido. Solicita uno nuevo a un manager.');
 return{tokenHash:hashes[0],type:types[0] as AccountLink['type']};
}
export function passwordIssues(password:string,confirmation:string){
 const issues:string[]=[];
 if(password.length<12)issues.push('Usa una contraseña de al menos 12 caracteres; puede ser una frase que recuerdes.');
 if(new TextEncoder().encode(password).length>72)issues.push('La contraseña supera el límite del servicio. Usa una frase más corta; los acentos y símbolos ocupan más espacio.');
 if(password!==confirmation)issues.push('Las dos contraseñas deben coincidir.');
 return issues;
}

export function accountRecoveryRedirect(webOrigin:string,isNative:boolean){
 return (isNative?'https://la-casa-del-angel.vercel.app':webOrigin)+'/cuenta';
}

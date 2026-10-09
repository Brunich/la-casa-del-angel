import {generateKeyPairSync,createPublicKey} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd();
const keyDir=process.argv[2]&&path.resolve(process.argv[2]);
if(!keyDir||keyDir===root||keyDir.startsWith(root+path.sep))throw new Error('Provide an explicit signing directory outside the project.');
await fs.mkdir(keyDir,{recursive:true});
const privateFile=path.join(keyDir,'ota-private.pem');
let privatePem;
try{privatePem=await fs.readFile(privateFile,'utf8')}
catch(error){
 if(error.code!=='ENOENT')throw error;
 const pair=generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'pkcs1',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
 privatePem=pair.privateKey;await fs.writeFile(privateFile,privatePem,{mode:0o600,flag:'wx'});
}
const key=createPublicKey(privatePem);
if(key.asymmetricKeyDetails.modulusLength!==2048)throw new Error('Updater V2 requires a 2048-bit RSA key.');
const pkcs1=key.export({type:'pkcs1',format:'pem'}).toString();
const spki=key.export({type:'spki',format:'pem'}).toString();
await fs.writeFile(path.join(root,'src/lib/ota-public-key.ts'),`// Public trust anchor. Private signing material stays outside the repository.\nexport const OTA_PUBLIC_KEY_PKCS1=${JSON.stringify(pkcs1)};\nexport const OTA_PUBLIC_KEY_SPKI=${JSON.stringify(spki)};\nexport const OTA_NATIVE_BUILD=3;\nexport const OTA_ENABLED=false;\n`);
console.log('Public OTA trust anchor prepared. Private key kept outside the project; automatic activation remains disabled.');

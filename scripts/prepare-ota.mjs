import {readFile,writeFile,readdir,mkdir,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,createCipheriv,createDecipheriv,privateEncrypt,publicDecrypt,createPublicKey,randomBytes,sign,verify,constants} from 'node:crypto';
import {zipSync,unzipSync} from 'fflate';

// Creates a signed release from the real production build. Never uploads keys or deploys.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const keyPath=path.resolve(process.argv[2]||'');
if(!process.argv[2]||keyPath===root||keyPath.startsWith(root+path.sep))throw new Error('Provide a signing key outside the repository.');
const pkg=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
if(!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(pkg.version))throw new Error('Invalid release version.');
const key=await readFile(keyPath,'utf8');
const publicKey=createPublicKey(key);
const keySource=await readFile(path.join(root,'src/lib/ota-public-key.ts'),'utf8');
if(!keySource.includes(JSON.stringify(publicKey.export({type:'spki',format:'pem'}))))throw new Error('Signing key does not match the public key embedded in this app.');
const files={};
async function collect(dir,prefix=''){
 for(const entry of await readdir(dir,{withFileTypes:true})){
  if(entry.isSymbolicLink())throw new Error('Symlinks are not permitted in release assets.');
  const name=prefix+entry.name;
  if(name==='updates'||name.startsWith('updates/'))continue;
  if(entry.name.startsWith('.')||/\.(pem|key|jks|keystore|map)$/i.test(name))throw new Error('Forbidden release asset.');
  const location=path.join(dir,entry.name);
  if(entry.isDirectory())await collect(location,name+'/');
  else if(entry.isFile())files[name]=new Uint8Array(await readFile(location));
 }
}
await collect(path.join(root,'dist'));
if(!files['index.html']||!Object.keys(files).some(name=>name.startsWith('assets/')&&name.endsWith('.js')))throw new Error('Build the application before preparing an update.');
if(!files['release.json']||JSON.parse(new TextDecoder().decode(files['release.json'])).version!==pkg.version)throw new Error('Build is stale: embedded version does not match package.json.');
const zip=Buffer.from(zipSync(files,{level:6}));
const digest=createHash('sha256').update(zip).digest();
const aesKey=randomBytes(16),iv=randomBytes(16);
const cipher=createCipheriv('aes-128-cbc',aesKey,iv);
const encrypted=Buffer.concat([cipher.update(zip),cipher.final()]);
const checksum=privateEncrypt({key,padding:constants.RSA_PKCS1_PADDING},digest).toString('hex');
const sessionKey=iv.toString('base64')+':'+privateEncrypt({key,padding:constants.RSA_PKCS1_PADDING},aesKey).toString('base64');
const payload={appId:'mx.lacasadelangel.cuidados',platform:'android',version:pkg.version,minNativeBuild:3,maxNativeBuild:3,url:`https://la-casa-del-angel.vercel.app/updates/bundles/${pkg.version}.zip`,sha256:digest.toString('hex'),checksum,sessionKey};
const bytes=Buffer.from(JSON.stringify(payload));
const signature=sign('RSA-SHA256',bytes,key);
if(!verify('RSA-SHA256',bytes,publicKey,signature))throw new Error('Manifest signature verification failed.');
const recoveredKey=publicDecrypt({key:publicKey,padding:constants.RSA_PKCS1_PADDING},Buffer.from(sessionKey.split(':')[1],'base64'));
const decipher=createDecipheriv('aes-128-cbc',recoveredKey,iv);
const recoveredZip=Buffer.concat([decipher.update(encrypted),decipher.final()]);
if(!createHash('sha256').update(recoveredZip).digest().equals(publicDecrypt({key:publicKey,padding:constants.RSA_PKCS1_PADDING},Buffer.from(checksum,'hex')))||!recoveredZip.equals(zip)||!unzipSync(recoveredZip)['index.html'])throw new Error('Bundle encryption/integrity verification failed.');
const output=path.join(root,'public','updates');
await mkdir(path.join(output,'bundles'),{recursive:true});
const bundlePath=path.join(output,'bundles',`${pkg.version}.zip`);
try{await stat(bundlePath);throw new Error('Release already exists. Increment version; never overwrite a published bundle.');}catch(error){if(error.code!=='ENOENT')throw error;}
await writeFile(bundlePath,encrypted,{flag:'wx'});
await writeFile(path.join(output,'latest.json'),JSON.stringify({payload:bytes.toString('base64'),signature:signature.toString('base64')}));
console.log(JSON.stringify({version:pkg.version,files:Object.keys(files).length,encryptedBytes:encrypted.length,sha256:payload.sha256,verified:true}));

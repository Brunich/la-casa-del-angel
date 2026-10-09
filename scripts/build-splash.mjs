// Render our own vector brand as native launch assets; no clinical imagery.
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
const root=process.cwd();
const icon=await fs.readFile(path.join(root,'public/app-icon.svg'),'utf8');
const splash=icon.replace('fill="#335b4c"','fill="#fcfaf5"').replace('translate(184 184) scale(27.333)','translate(352 352) scale(13.333)').replace('stroke="#fcfaf5"','stroke="#335b4c"');
await fs.writeFile(path.join(root,'public/app-splash.svg'),splash);
const res=path.join(root,'android/app/src/main/res');
for(const entry of await fs.readdir(res,{withFileTypes:true})){
 if(!entry.isDirectory()||!entry.name.startsWith('drawable'))continue;
 const file=path.join(res,entry.name,'splash.png');
 try{
  await fs.access(file);
  const {width,height}=await sharp(file).metadata();
  await sharp(Buffer.from(splash)).resize(width,height,{fit:'contain',background:'#fcfaf5'}).png().toFile(file+'.new');
  await fs.rename(file+'.new',file);
 }catch(error){if(error.code==='ENOENT')continue;throw error;}
}
const ios=path.join(root,'ios/App/App/Assets.xcassets/Splash.imageset');
for(const name of ['splash-2732x2732.png','splash-2732x2732-1.png','splash-2732x2732-2.png'])await sharp(Buffer.from(splash)).resize(2732,2732).png().toFile(path.join(ios,name));
console.log('Brand launch assets generated from the project SVG for Android and iOS.');

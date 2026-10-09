import sharp from 'sharp';import fs from 'node:fs/promises';import path from 'node:path';
const root=process.cwd();
await fs.mkdir(path.join(root,'public/icons'),{recursive:true});
for(const size of [180,192,512,1024])await sharp(path.join(root,'public/app-icon.svg')).resize(size,size).png().toFile(path.join(root,'public/icons/icon-'+size+'.png'));
await sharp(path.join(root,'public/app-icon.svg')).resize(1024,1024).png().toFile(path.join(root,'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'));
const sizes={mdpi:48,hdpi:72,xhdpi:96,xxhdpi:144,xxxhdpi:192};
for(const[density,size]of Object.entries(sizes)){
const dir=path.join(root,'android/app/src/main/res/mipmap-'+density);await fs.mkdir(dir,{recursive:true});
for(const name of ['ic_launcher','ic_launcher_round'])await sharp(path.join(root,'public/app-icon.svg')).resize(size,size).png().toFile(path.join(dir,name+'.png'));
await sharp(path.join(root,'public/app-icon.svg')).resize(Math.round(size*2.25),Math.round(size*2.25)).png().toFile(path.join(dir,'ic_launcher_foreground.png'));
}
await fs.mkdir(path.join(root,'android/app/src/main/res/drawable'),{recursive:true});
await fs.writeFile(path.join(root,'android/app/src/main/res/drawable/ic_stat_care.xml'),'<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24"><path android:fillColor="#FFFFFF" android:pathData="M12,21L3.5,12.5C1,10 1,6 3.5,3.5C6,1 10,1 12,4C14,1 18,1 20.5,3.5C23,6 23,10 20.5,12.5Z"/></vector>');
console.log('Iconos web, Apple y Android generados desde SVG propio.');

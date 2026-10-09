export const PHOTO_MAX_BYTES=600*1024;
export const PHOTO_INPUT_MAX_BYTES=24*1024*1024;
export const PHOTO_MIN_EDGE=1280;
export interface PreparedCarePhoto{readonly blob:Blob;readonly width:number;readonly height:number;readonly quality:number}
export function photoFits(bytes:number){return Number.isFinite(bytes)&&bytes>0&&bytes<=PHOTO_MAX_BYTES}
export function validatePreparedPhoto(photo:PreparedCarePhoto){
 if(!(photo.blob instanceof Blob)||photo.blob.type!=='image/jpeg'||!photoFits(photo.blob.size))throw new Error('La fotografía preparada no cumple el formato o tamaño permitido. Elige otra foto.');
 if(!Number.isInteger(photo.width)||!Number.isInteger(photo.height)||photo.width<=0||photo.height<=0||Math.max(photo.width,photo.height)>1920||Math.max(photo.width,photo.height)<PHOTO_MIN_EDGE||!Number.isFinite(photo.quality)||photo.quality<.84||photo.quality>1)throw new Error('La fotografía no tiene la resolución requerida. Toma otra foto con buena luz.');
}
export function photoDimensions(width:number,height:number,edge=1920){
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0||width*height>64_000_000)throw new Error('La imagen tiene dimensiones no compatibles.');
 const scale=Math.min(1,edge/Math.max(width,height));
 return{width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};
}
export async function compressCarePhoto(file:File):Promise<PreparedCarePhoto>{
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>PHOTO_INPUT_MAX_BYTES)throw new Error('Usa una foto JPG, PNG o WebP de hasta 24 MB. Si tu iPhone ofrece HEIC, elige una captura compatible en JPEG.');
 let bitmap:ImageBitmap;
 try{bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});}catch{throw new Error('No se pudo abrir la foto. Elige otra imagen compatible.');}
 try{
  if(Math.max(bitmap.width,bitmap.height)<PHOTO_MIN_EDGE)throw new Error('Esta foto es demasiado pequeña. Toma otra con al menos 1280 píxeles en su lado mayor, buena luz y enfoque.');
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{alpha:false});
  if(!ctx)throw new Error('No se pudo preparar la foto.');
  // Select the largest dimensions and highest quality that meet the storage cap.
  // Re-encoding removes EXIF location; never upload the uncompressed original.
  for(const edge of [1920,1600,1280]){
   const dimensions=photoDimensions(bitmap.width,bitmap.height,edge);canvas.width=dimensions.width;canvas.height=dimensions.height;
   ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
   for(const quality of [.92,.88,.84]){
    const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(result=>result?resolve(result):reject(new Error('No se pudo comprimir la foto.')),'image/jpeg',quality));
    if(photoFits(blob.size)){const photo={blob,...dimensions,quality};validatePreparedPhoto(photo);return photo;}
   }
  }
  throw new Error('Esta foto no alcanza el límite de 600 KB con buena calidad. Toma una foto más cercana y enfocada.');
 }finally{bitmap.close();}
}

import { owner,db,bucket,json,failure,AppError } from '../../../lib/server';
export const dynamic='force-dynamic';
export async function POST(request:Request){try{
  const user=await owner(request);
  if(Number(request.headers.get('content-length')??0)>11*1024*1024)throw new AppError('照片请小于 10 MB。',413);
  const form=await request.formData(), file=form.get('photo'),date=String(form.get('date')??''),view=String(form.get('view')??'');
  if(!(file instanceof File)||file.size>10*1024*1024||file.size<12)throw new AppError('请选择小于 10 MB 的 JPG、PNG 或 WebP 照片。');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date||!['正面','侧面','背面'].includes(view))throw new AppError('请选择有效拍摄日期和角度。');
  const bytes=await file.arrayBuffer(), head=new Uint8Array(bytes.slice(0,16));
  let mime='';if(head[0]===255&&head[1]===216&&head[2]===255)mime='image/jpeg';
  if(head[0]===137&&head[1]===80&&head[2]===78&&head[3]===71&&head[4]===13&&head[5]===10&&head[6]===26&&head[7]===10)mime='image/png';
  if(String.fromCharCode(...head.slice(0,4))==='RIFF'&&String.fromCharCode(...head.slice(8,12))==='WEBP')mime='image/webp';
  if(!mime)throw new AppError('照片格式不支持，请转为 JPG、PNG 或 WebP。');
  const photoId=crypto.randomUUID(), key=`photos/${photoId}`, storage=bucket();
  await storage.put(key,bytes,{httpMetadata:{contentType:mime}});
  try{await db().prepare('INSERT INTO photos(id,user_id,object_key,mime,date,view,created_at) VALUES(?,?,?,?,?,?,?)').bind(photoId,user,key,mime,date,view,new Date().toISOString()).run();}
  catch(e){await storage.delete(key);throw e;}
  return json({id:photoId});
}catch(e){return failure(e);}}

import { owner,db,bucket,json,failure,AppError } from '../../../../lib/server';
export const dynamic='force-dynamic';
type Context={params:Promise<{id:string}>};
async function find(request:Request,ctx:Context){const user=await owner(request);const {id}=await ctx.params;const row=await db().prepare('SELECT * FROM photos WHERE id=? AND user_id=?').bind(id,user).first<any>();if(!row)throw new AppError('照片不存在。',404);return row;}
export async function GET(request:Request,ctx:Context){try{
  const row=await find(request,ctx), object=await bucket().get(row.object_key);if(!object)throw new AppError('照片不存在。',404);
  return new Response(object.body,{headers:{'Content-Type':row.mime,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Disposition':`${new URL(request.url).searchParams.has('download')?'attachment':'inline'}; filename="body-${row.date}-${row.id}.${row.mime==='image/jpeg'?'jpg':row.mime==='image/png'?'png':'webp'}"`}});
}catch(e){return failure(e);}}
export async function DELETE(request:Request,ctx:Context){try{
  const row=await find(request,ctx);await bucket().delete(row.object_key);await db().prepare('DELETE FROM photos WHERE id=? AND user_id=?').bind(row.id,row.user_id).run();return json({ok:true});
}catch(e){return failure(e);}}

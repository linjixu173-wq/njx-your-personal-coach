import { z } from 'zod';
import { owner,json,failure,AppError } from '../../../lib/server';
import { loadState,act } from '../../../lib/service';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{return json(await loadState(await owner(request)));}catch(e){return failure(e);}}
export async function POST(request:Request){try{
  const user=await owner(request);const text=await request.text();if(text.length>250000)throw new AppError('数据太大。',413);
  let body;try{body=JSON.parse(text);}catch{throw new AppError('请求格式错误。');}
  if(!body||typeof body!=='object')throw new AppError('请求格式错误。');
  return json(await act(user,body));
}catch(e){if(e instanceof z.ZodError)return json({error:'请求数据格式错误。'},400);return failure(e);}}

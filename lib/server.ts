import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../app/chatgpt-auth';
export class AppError extends Error { constructor(message:string,public status=400){super(message);} }
export async function owner(request?:Request){
  const user=await getChatGPTUser(); if(!user)throw new AppError('请先登录后再访问。',401);
  if(request && !['GET','HEAD'].includes(request.method)){
    const origin=request.headers.get('origin');
    if(origin && origin!==new URL(request.url).origin)throw new AppError('请求来源无效。',403);
    if(request.headers.get('sec-fetch-site')==='cross-site')throw new AppError('请求来源无效。',403);
  }
  return user.userId;
}
export function db(){if(!env.DB)throw new AppError('数据服务暂时不可用，请稍后重试。',503);return env.DB;}
export function bucket(){if(!env.BUCKET)throw new AppError('照片服务暂时不可用，请稍后重试。',503);return env.BUCKET;}
export function json(data:any,status=200){return Response.json(data,{status,headers:{'Cache-Control':'no-store'}});}
export function failure(error:unknown){
  if(error instanceof AppError)return json({error:error.message},error.status);
  console.error('coach request failed',error instanceof Error?error.name:'unknown');
  return json({error:'暂时无法保存或读取。输入已保留，请稍后重试。'},503);
}

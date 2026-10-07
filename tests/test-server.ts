// Test-only identity adapter. Never imported by production source.
import { env } from 'cloudflare:workers';
export class AppError extends Error {constructor(message:string,public status=400){super(message);}}
export async function owner(request:Request){const user=request.headers.get('x-test-user');if(!user)throw new AppError('请先登录',401);return user;}
export function db(){if(!env.DB)throw new AppError('数据服务暂时不可用',503);return env.DB;}
export function bucket(){if(!env.BUCKET)throw new AppError('照片服务暂时不可用',503);return env.BUCKET;}
export function json(data:any,status=200){return Response.json(data,{status});}
export function failure(e:unknown){if(!(e instanceof AppError))console.error(e);return json({error:e instanceof AppError?e.message:'存储失败'},e instanceof AppError?e.status:503);}

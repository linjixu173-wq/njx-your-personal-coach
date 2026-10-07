import { z } from 'zod';
import { db, AppError } from './server';
import { profileSchema, parseAI, planDiff, makePrompt, type State, type Batch, type Plan, type Workout } from './contracts';
const now=()=>new Date().toISOString();
const id=()=>crypto.randomUUID();
export async function loadState(user:string):Promise<State>{
  const database=db();
  const [profile,p,s,ph,b]=await Promise.all([
    database.prepare('SELECT * FROM profiles WHERE user_id=?').bind(user).first<any>(),
    database.prepare('SELECT * FROM plans WHERE user_id=? ORDER BY created_at DESC').bind(user).all<any>(),
    database.prepare('SELECT * FROM sessions WHERE user_id=? ORDER BY created_at DESC').bind(user).all<any>(),
    database.prepare('SELECT id,date,view,created_at FROM photos WHERE user_id=? ORDER BY date DESC,created_at DESC').bind(user).all<any>(),
    database.prepare('SELECT * FROM batches WHERE user_id=? ORDER BY created_at DESC LIMIT 12').bind(user).all<any>(),
  ]);
  return {profile:profile?{...JSON.parse(profile.data),nickname:JSON.parse(profile.data).nickname??''}:null,profileRevision:profile?.revision??0,activePlanId:profile?.active_plan_id??null,
    plans:p.results.map(r=>({...JSON.parse(r.data),id:r.id,createdAt:r.created_at})),
    sessions:s.results.map(r=>({...JSON.parse(r.data),status:r.status,revision:r.revision})),
    photos:ph.results.map(r=>({id:r.id,date:r.date,view:r.view,createdAt:r.created_at})),
    batches:b.results.map(r=>({id:r.id,kind:r.kind,basePlanId:r.base_plan_id,createdAt:r.created_at,data:JSON.parse(r.data)}))};
}
const setSchema=z.object({weightKg:z.number().min(0).max(600).nullable(),reps:z.number().int().min(1).max(200).nullable(),state:z.enum(['pending','done','skipped'])});
const logSchema=z.record(z.object({sets:z.array(setSchema).min(1).max(12),difficulty:z.enum(['未填写','轻松','合适','吃力']),discomfort:z.string().max(1000)}));
async function validateImport(user:string,raw:string){
  let parsed;try{parsed=parseAI(raw);}catch(e){throw new AppError((e as Error).message);}
  const row=await db().prepare('SELECT * FROM batches WHERE id=? AND user_id=?').bind(parsed.batchId,user).first<any>();
  if(!row)throw new AppError('找不到对应资料批次，请先在本网页生成提示词。');
  const batch:Batch={id:row.id,kind:row.kind,basePlanId:row.base_plan_id,createdAt:row.created_at,data:JSON.parse(row.data)};
  if(parsed.kind!==batch.kind||parsed.basePlanId!==batch.basePlanId)throw new AppError('结果与资料批次不匹配，请保留提示词中的 kind 和 basePlanId。');
  if(parsed.plan.split!==batch.data.profile.split)throw new AppError('结果分化数与导出的选择不同，请让 AI 按原分化数输出。');
  if(parsed.kind==='review'&&!parsed.reasons.length)throw new AppError('复盘结果需填写调整原因 reasons。');
  const [profile,used,current]=await Promise.all([
    db().prepare('SELECT active_plan_id FROM profiles WHERE user_id=?').bind(user).first<any>(),
    db().prepare('SELECT id FROM plans WHERE user_id=? AND batch_id=?').bind(user,batch.id).first<any>(),
    batch.basePlanId?db().prepare('SELECT * FROM plans WHERE user_id=? AND id=?').bind(user,batch.basePlanId).first<any>():Promise.resolve(null),
  ]);
  if(used)throw new AppError('这份结果已经导入，请生成新的资料批次。',409);
  if(!profile||(profile.active_plan_id??null)!==batch.basePlanId)throw new AppError('当前计划已变化，这份建议已过期。请重新生成复盘资料。',409);
  const previous:Plan|null=current?{...JSON.parse(current.data),id:current.id,createdAt:current.created_at}:null;
  return {result:parsed,diff:planDiff(previous,parsed),batch};
}
export async function act(user:string,body:any):Promise<any>{
  const database=db();
  switch(body.op){
    case 'profile': {
      const p=profileSchema.safeParse(body.profile);if(!p.success)throw new AppError(p.error.issues.find(x=>x.path[0]==='nickname')?.message??'请检查身高、体重和训练设置，数值需在合理范围内。');
      const revision=z.number().int().min(0).parse(body.revision);
      const exists=await database.prepare('SELECT revision FROM profiles WHERE user_id=?').bind(user).first<any>();
      if(exists){const r=await database.prepare('UPDATE profiles SET data=?,revision=revision+1,updated_at=? WHERE user_id=? AND revision=?').bind(JSON.stringify(p.data),now(),user,revision).run();if(!r.meta.changes)throw new AppError('档案已在其他设备更新，请刷新后再保存。',409);}
      else{if(revision!==0)throw new AppError('档案状态变化，请刷新。',409);await database.prepare('INSERT INTO profiles(user_id,data,updated_at) VALUES(?,?,?)').bind(user,JSON.stringify(p.data),now()).run();}
      break;
    }
    case 'batch': {
      const state=await loadState(user);if(!state.profile)throw new AppError('请先保存身体档案。');
      const kind=z.enum(['initial','review']).parse(body.kind);
      const active=state.plans.find(p=>p.id===state.activePlanId);
      if(kind==='review'&&!active)throw new AppError('请先导入一份训练计划。');
      const photoIds=z.array(z.string()).max(12).parse(body.photoIds??[]);
      const selected=state.photos.filter(p=>photoIds.includes(p.id));if(selected.length!==new Set(photoIds).size)throw new AppError('选择的照片已不存在，请刷新。');
      const sessionId=z.string().optional().parse(body.sessionId);
      const reviewSession=sessionId?state.sessions.find(s=>s.id===sessionId&&s.status==='complete'):null;
      if(sessionId&&!reviewSession)throw new AppError('找不到已完成的训练记录。');
      if(kind==='review'&&reviewSession&&reviewSession.planId!==state.activePlanId)throw new AppError('这次训练属于历史计划，请从当前计划生成复盘。');
      const batch:Batch={id:id(),kind,basePlanId:state.activePlanId,createdAt:now(),data:{profile:state.profile,currentPlan:active??null,recentWorkouts:kind==='review'?(reviewSession?[reviewSession,...state.sessions.filter(s=>s.status==='complete'&&s.id!==sessionId).slice(0,7)]:state.sessions.filter(s=>s.status==='complete').slice(0,8)):state.sessions.filter(s=>s.status==='complete').slice(0,5),photos:selected}};
      await database.prepare('INSERT INTO batches(id,user_id,kind,base_plan_id,data,created_at) VALUES(?,?,?,?,?,?)').bind(batch.id,user,kind,batch.basePlanId,JSON.stringify(batch.data),batch.createdAt).run();
      return {batch,prompt:makePrompt(batch)};
    }
    case 'preview': return validateImport(user,z.string().max(200000).parse(body.raw));
    case 'confirm': {
      const v=await validateImport(user,z.string().max(200000).parse(body.raw));const planId=id();const timestamp=now();
      const results=await database.batch([
        database.prepare('INSERT INTO plans(id,user_id,batch_id,base_plan_id,data,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM profiles WHERE user_id=? AND active_plan_id IS ?)').bind(planId,user,v.batch.id,v.batch.basePlanId,JSON.stringify(v.result),timestamp,user,v.batch.basePlanId),
        database.prepare('UPDATE profiles SET active_plan_id=?,updated_at=? WHERE user_id=? AND active_plan_id IS ? AND EXISTS (SELECT 1 FROM plans WHERE id=? AND user_id=?)').bind(planId,timestamp,user,v.batch.basePlanId,planId,user),
      ]);
      if(!results[0].meta.changes)throw new AppError('计划已在其他设备变化，请重新生成资料。',409);
      break;
    }
    case 'restore': {
      const target=z.string().parse(body.planId);const expected=z.string().nullable().parse(body.expectedActive);
      const r=await database.prepare('UPDATE profiles SET active_plan_id=?,updated_at=? WHERE user_id=? AND active_plan_id IS ? AND EXISTS (SELECT 1 FROM plans WHERE id=? AND user_id=?)').bind(target,now(),user,expected,target,user).run();
      if(!r.meta.changes)throw new AppError('计划状态已变化或版本不存在，请刷新。',409);break;
    }
    case 'start': {
      const state=await loadState(user);const draft=state.sessions.find(s=>s.status==='draft');if(draft)return {state};
      const plan=state.plans.find(p=>p.id===state.activePlanId);if(!plan)throw new AppError('请先导入训练计划。');
      if(body.planId!==plan.id)throw new AppError('计划已更新，请刷新后开始。',409);
      const day=plan.plan.days.find(d=>d.id===body.dayId);if(!day)throw new AppError('找不到训练日。');
      const workout:Workout={id:id(),planId:plan.id,planTitle:plan.plan.title,day,startedAt:now(),finishedAt:null,notes:'',status:'draft',revision:0,logs:Object.fromEntries(day.exercises.map(e=>[e.id,{sets:Array.from({length:e.sets},()=>({weightKg:e.weightKg,reps:null,state:'pending'})),difficulty:'未填写',discomfort:''}]))};
      await database.prepare('INSERT INTO sessions(id,user_id,status,data,created_at) VALUES(?,?,?,?,?)').bind(workout.id,user,'draft',JSON.stringify(workout),workout.startedAt).run();break;
    }
    case 'workout': {
      const workoutId=z.string().parse(body.id);const row=await database.prepare('SELECT * FROM sessions WHERE id=? AND user_id=?').bind(workoutId,user).first<any>();
      if(!row)throw new AppError('找不到训练记录。',404);if(row.status!=='draft')throw new AppError('训练已经结束，请刷新查看。',409);
      const logs=logSchema.safeParse(body.logs);if(!logs.success)throw new AppError('请检查重量和次数，次数需为正整数。');
      const session:Workout=JSON.parse(row.data);const complete=body.complete===true;
      if(Object.keys(logs.data).length!==session.day.exercises.length)throw new AppError('训练动作不匹配。');
      for(const e of session.day.exercises){const log=logs.data[e.id];if(!log||log.sets.length!==e.sets)throw new AppError('训练组数不匹配。');for(const set of log.sets){if(set.state==='done'&&(set.weightKg===null||set.reps===null))throw new AppError('完成的训练组请填写重量和次数；自重动作重量可填 0。');if(complete&&set.state==='pending')throw new AppError('结束前请将每一组标为完成或跳过。');}}
      const revision=z.number().int().min(0).parse(body.revision);const notes=z.string().max(4000).parse(body.notes??'');
      const updated={...session,logs:logs.data,notes,finishedAt:complete?now():null};
      const r=await database.prepare('UPDATE sessions SET data=?,status=?,revision=revision+1 WHERE id=? AND user_id=? AND revision=? AND status=\'draft\'').bind(JSON.stringify(updated),complete?'complete':'draft',workoutId,user,revision).run();
      if(!r.meta.changes)throw new AppError('训练已在其他设备更新。请先下载当前记录备份，再刷新。',409);break;
    }
    default: throw new AppError('未知操作。');
  }
  return {state:await loadState(user)};
}

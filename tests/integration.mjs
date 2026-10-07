import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
import {readFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
mkdirSync('.sites-runtime',{recursive:true});
await build({entryPoints:['tests/worker.ts'],outfile:'.sites-runtime/test-worker.mjs',bundle:true,format:'esm',platform:'browser',external:['cloudflare:workers'],plugins:[{name:'test-server',setup(b){b.onResolve({filter:/lib\/server$|^\.\/server$/},()=>({path:path.resolve('tests/test-server.ts')}));}}]});
const script=readFileSync('.sites-runtime/test-worker.mjs','utf8');
const mf=new Miniflare({modules:true,script,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],r2Buckets:['BUCKET']});
const db=await mf.getD1Database('DB');
for(const s of readFileSync('drizzle/0000_nosy_garia.sql','utf8').split('--> statement-breakpoint').filter(x=>x.trim()))await db.prepare(s).run();
let checks=0;
async function call(user,body,status=200){const r=await mf.dispatchFetch('http://test/api/coach',{method:body?'POST':'GET',headers:{...(user?{'x-test-user':user}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();assert.equal(r.status,status,JSON.stringify(data));checks++;return data;}
const profile={nickname:'测试昵称',height:175,weight:70,bodyFat:null,goal:'增肌',experience:'新手',daysPerWeek:3,minutes:60,split:3,knownWeights:'',limitations:''};
const makeResult=b=>({schemaVersion:1,batchId:b.id,kind:b.kind,basePlanId:b.basePlanId,analysis:{observations:[],strengthen:['训练反馈中的目标肌群'],uncertainty:'没有照片，不判断形态'},plan:{title:'集成测试计划',split:b.data.profile.split,days:Array.from({length:b.data.profile.split},(_,i)=>({id:'day-'+i,name:'测试训练日 '+i,exercises:[{id:'e1',name:'测试动作',muscles:['测试肌群'],sets:2,repMin:8,repMax:12,restSeconds:90,weightKg:null,weightNote:'待试练校准',notes:'按实际反馈校准'}]})),notes:'测试数据'},reasons:b.kind==='review'?['依据训练反馈调整']:[]});
try{
  await call(null,null,401);
  await call('aji',{op:'profile',profile,revision:0});
  await call('other',{op:'profile',profile:{...profile,nickname:'另一位用户',weight:60},revision:0});
  const other=await call('other');assert.equal(other.plans.length,0);
  assert.equal(other.profile.nickname,'另一位用户');assert.equal((await call('aji')).profile.nickname,'测试昵称');
  await call('aji',{op:'profile',profile:{...profile,nickname:'   '},revision:0},400);
  await call('aji',{op:'profile',profile:{...profile,nickname:'长'.repeat(21)},revision:0},400);
  const oldProfile={...profile};delete oldProfile.nickname;
  await db.prepare('INSERT INTO profiles(user_id,data,updated_at) VALUES(?,?,?)').bind('legacy',JSON.stringify(oldProfile),new Date().toISOString()).run();
  const legacy=await call('legacy');assert.equal(legacy.profile.nickname,'');assert.equal(legacy.profile.weight,profile.weight);
  const renamed=await call('legacy',{op:'profile',profile:{...oldProfile,nickname:'新的昵称'},revision:0});assert.equal(renamed.state.profile.nickname,'新的昵称');
  const invalid=await call('aji',{op:'preview',raw:'不是 JSON'},400);assert.match(invalid.error,/JSON/);
  const {batch}=await call('aji',{op:'batch',kind:'initial',photoIds:[]});const result=makeResult(batch);const raw='说明文字\n```json\n'+JSON.stringify(result)+'\n```';
  await call('other',{op:'preview',raw},400);
  await call('aji',{op:'preview',raw});let s=await call('aji');assert.equal(s.activePlanId,null,'preview must not activate');
  s=(await call('aji',{op:'confirm',raw})).state;const first=s.activePlanId;
  await call('aji',{op:'confirm',raw},409);
  s=(await call('aji',{op:'start',planId:first,dayId:'day-0'})).state;let w=s.sessions[0];
  w.logs.e1.sets[0]={weightKg:10,reps:10,state:'done'};
  s=(await call('aji',{op:'workout',id:w.id,revision:0,logs:w.logs,notes:'中途保存',complete:false})).state;assert.equal(s.sessions[0].revision,1);
  await call('aji',{op:'workout',id:w.id,revision:0,logs:w.logs,notes:'旧记录',complete:false},409);
  await call('aji',{op:'workout',id:w.id,revision:1,logs:w.logs,complete:true},400);
  w.logs.e1.sets[1].state='skipped';w.logs.e1.difficulty='吃力';w.logs.e1.discomfort='测试不适反馈';
  s=(await call('aji',{op:'workout',id:w.id,revision:1,logs:w.logs,notes:'完整记录',complete:true})).state;assert.equal(s.sessions[0].status,'complete');
  await call('other',{op:'workout',id:w.id,revision:2,logs:w.logs},404);
  const review=(await call('aji',{op:'batch',kind:'review',sessionId:w.id})).batch;assert.equal(review.data.recentWorkouts[0].logs.e1.discomfort,'测试不适反馈');
  const stale=(await call('aji',{op:'batch',kind:'review'})).batch;
  const adjusted=makeResult(review);adjusted.plan.days[0].exercises[0].weightKg=8;adjusted.reasons=['依据实际表现降低测试重量'];
  const preview=await call('aji',{op:'preview',raw:JSON.stringify(adjusted)});assert(preview.diff.some(x=>x.includes('重量')));
  s=(await call('aji',{op:'confirm',raw:JSON.stringify(adjusted)})).state;const second=s.activePlanId;assert.notEqual(first,second);
  await call('aji',{op:'confirm',raw:JSON.stringify(makeResult(stale))},409);
  s=(await call('aji',{op:'restore',planId:first,expectedActive:second})).state;assert.equal(s.activePlanId,first);assert.equal(s.sessions[0].notes,'完整记录');
  await call('other',{op:'restore',planId:first,expectedActive:null},409);
  await call('aji',{op:'profile',profile,revision:99},409);
  for(const split of [2,3,4,5]){
    s=(await call('aji',{op:'profile',profile:{...profile,split},revision:s.profileRevision})).state;
    const b=(await call('aji',{op:'batch',kind:'initial'})).batch;await call('aji',{op:'preview',raw:JSON.stringify(makeResult(b))});
    const bad=makeResult(b);bad.plan.days[0].exercises[0].weightKg=-1;await call('aji',{op:'preview',raw:JSON.stringify(bad)},400);
  }
  const form=new FormData();form.append('date','2026-10-06');form.append('view','正面');form.append('photo',new File([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lV0AAAAASUVORK5CYII=','base64')],'test.png',{type:'image/png'}));
  const uploadRequest=new Request('http://test/api/photos',{method:'POST',body:form});
  let r=await mf.dispatchFetch('http://test/api/photos',{method:'POST',headers:{'x-test-user':'aji','Content-Type':uploadRequest.headers.get('content-type')},body:await uploadRequest.arrayBuffer()});assert.equal(r.status,200);checks++;const photo=await r.json();
  r=await mf.dispatchFetch(`http://test/api/photos/${photo.id}`,{headers:{'x-test-user':'other'}});assert.equal(r.status,404);checks++;
  r=await mf.dispatchFetch(`http://test/api/photos/${photo.id}`);assert.equal(r.status,401);checks++;
  r=await mf.dispatchFetch(`http://test/api/photos/${photo.id}`,{headers:{'x-test-user':'aji'}});assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'private, no-store');checks++;
  r=await mf.dispatchFetch(`http://test/api/photos/${photo.id}`,{method:'DELETE',headers:{'x-test-user':'other'}});assert.equal(r.status,404);checks++;
  r=await mf.dispatchFetch(`http://test/api/photos/${photo.id}`,{method:'DELETE',headers:{'x-test-user':'aji'}});assert.equal(r.status,200);checks++;
  r=await mf.dispatchFetch(`http://test/api/photos/${photo.id}`,{headers:{'x-test-user':'aji'}});assert.equal(r.status,404);checks++;
  const missing=new Miniflare({modules:true,script,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat']});try{r=await missing.dispatchFetch('http://test/api/coach',{headers:{'x-test-user':'aji'}});assert.equal(r.status,503);checks++;}finally{await missing.dispose();}
  console.log(`PASS: ${checks} API checks plus invariants; real local D1/R2, test-only identity adapter.`);
}finally{await mf.dispose();}

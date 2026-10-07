import { getChatGPTUser,chatGPTSignInPath } from './chatgpt-auth';
import Coach from './coach';
export const dynamic='force-dynamic';
export default async function Home(){
  const user=await getChatGPTUser();
  if(!user)return <main className="signin"><div className="brand-mark">C</div><span className="eyebrow">MY COACH / TRAINING JOURNAL</span><h1>你的专属小教练</h1><p>用自己的 AI 制定计划，把每一次训练变成下一次进步的依据。</p><a className="button primary" href={chatGPTSignInPath('/')} target="_top">登录并打开训练档案</a><small>照片与记录私密保存，电脑和手机同步。</small></main>;
  return <Coach />;
}

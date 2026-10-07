import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const target=path.resolve(root,process.argv[2]??'outputs/github-source');
if(!target.startsWith(path.join(root,'outputs')+path.sep))throw new Error('Export destination must be inside outputs/');
if(existsSync(target))throw new Error('Use a new empty export destination.');
mkdirSync(target,{recursive:true});
const files=[...new Set(execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean))];
const entries=[];
for(const filename of files){
  if(/(^|\/)(?:\.git|\.env[^/]*|node_modules|\.wrangler|\.sites-runtime|outputs)(\/|$)/.test(filename)||filename.endsWith('.tsbuildinfo'))continue;
  const source=path.resolve(root,filename);
  if(!source.startsWith(root+path.sep)||!existsSync(source))continue;
  const destination=path.resolve(target,filename);if(!destination.startsWith(target+path.sep))throw new Error('Invalid export path');
  mkdirSync(path.dirname(destination),{recursive:true});
  if(filename==='.openai/hosting.json'){
    const config=JSON.parse(readFileSync(source,'utf8'));delete config.project_id;delete config.artifact_metadata;
    writeFileSync(destination,JSON.stringify(config,null,2)+'\n');
  }else copyFileSync(source,destination);
  const content=readFileSync(destination,'utf8');
  if(content.includes('\u0000'))throw new Error('Unexpected binary source file: '+filename);
  if(/(?:ghp_|github_pat_|sk-proj-)[A-Za-z0-9_]{20,}/.test(content))throw new Error('Possible credential in '+filename);
  entries.push({path:filename.replaceAll('\\','/'),mode:'100644',type:'blob',content});
}
writeFileSync(path.resolve(target,'..',path.basename(target)+'-entries.json'),JSON.stringify(entries));
console.log(JSON.stringify({destination:target,files:entries.length,totalCharacters:entries.reduce((n,e)=>n+e.content.length,0)}));

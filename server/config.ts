import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for(const name of ['.env.local','.env']) { const file=path.join(root,name); if(fs.existsSync(file)) process.loadEnvFile(file); }
const credentialsDir=path.resolve(process.env.APP_CREDENTIALS_DIR || path.join(root,'..'));
function read(name:string){try{return fs.readFileSync(path.join(credentialsDir,name),'utf8').replace(/^\uFEFF/,'');}catch{return '';}}
const llm=read('大模型使用.txt'), search=read('元宝搜索.txt');
export const config={
  port:Number(process.env.PORT||4327),offline:process.env.APP_OFFLINE==='1',
  db:process.env.APP_DB_PATH||path.join(root,'data','kaoyan.sqlite'),
  python:process.env.PYTHON_BIN||'python',proxy:process.env.APP_HTTP_PROXY??'http://127.0.0.1:7897',
  model:process.env.LLM_MODEL||'qwen3.8-flash',
  base:(process.env.LLM_BASE_URL||llm.match(/兼容地址[：:]\s*(https:\/\/\S+)/)?.[1]||'').replace(/\/+$/,''),
  key:process.env.LLM_API_KEY||llm.split(/\r?\n/).find(s=>s.trim())?.trim()||'',
  secretId:process.env.TENCENTCLOUD_SECRET_ID||search.match(/SecretId\s*[:：]\s*(\S+)/i)?.[1]||'',
  secretKey:process.env.TENCENTCLOUD_SECRET_KEY||search.match(/SecretKey\s*[:：]\s*(\S+)/i)?.[1]||''
};
export function redact(value:unknown){let s=typeof value==='string'?value:JSON.stringify(value);for(const key of [config.key,config.secretId,config.secretKey])if(key)s=s.split(key).join('[REDACTED]');return s;}
export function readiness(){return {search:!!(config.secretId&&config.secretKey)&&!config.offline,model:!!(config.key&&config.base)&&!config.offline,modelName:config.model,offline:config.offline};}

import {spawn,execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {root} from '../server/config.ts';
const temp=path.resolve(fs.mkdtempSync(path.join(os.tmpdir(),'yantu-acceptance-')));
const env={...process.env,APP_OFFLINE:'1',APP_DB_PATH:path.join(temp,'test.sqlite'),PORT:'4328'};
let child:ReturnType<typeof spawn>|undefined;const checks:string[]=[];
async function start(){child=spawn(process.execPath,['--import','tsx','server/index.ts'],{cwd:root,env,stdio:'pipe'});for(let i=0;i<100;i++){try{const r=await fetch('http://127.0.0.1:4328/api/health');if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw new Error('验收服务启动失败');}
async function stop(){if(!child)return;const c=child;child=undefined;c.kill();await new Promise(r=>c.once('exit',r));}
async function req(url:string,method='GET',body?:unknown,origin?:string){return fetch('http://127.0.0.1:4328/api'+url,{method,headers:{'Content-Type':'application/json',...(origin?{Origin:origin}:{})},body:body?JSON.stringify(body):undefined});}
try{
 await start();const health=await(await req('/health')).json();assert.equal(health.offline,true);checks.push('离线启动与凭据状态不泄露');
 const list=await(await req('/programs')).json();assert.ok(list.length>=12);checks.push('干净数据库恢复真实公开核验节选');
 const p=list.find((p:any)=>p.schoolId==='btbu'),id=p.id;
 assert.equal((await req('/programs/'+id)).status,200);assert.equal((await req('/programs/not-found')).status,404);checks.push('详情和不存在条目');
 assert.equal((await req('/programs/'+id+'/selection','PUT',{candidate:true,watched:true})).status,200);checks.push('候选与关注保存');
 const blocked=await req('/jobs','POST',{kind:'search',year:2027,targets:[{schoolId:p.schoolId,code:p.code,name:p.name}]});assert.equal(blocked.status,400);assert.match((await blocked.json()).error,/离线/);checks.push('离线禁止新增外部调用');
 const four=await req('/comparisons','POST',{programIds:list.slice(0,4).map((p:any)=>p.id)});assert.equal(four.status,400);checks.push('对比上限');
 const c=await(await req('/comparisons','POST',{programIds:list.slice(0,3).map((p:any)=>p.id)})).json();assert.ok(c.id);checks.push('报告按当前字段保存快照');
 const html=await(await req('/comparisons/'+c.id+'/export')).text();assert.ok(html.includes('择校核对单')&&html.includes('https://')&&html.includes('待咨询清单'));checks.push('HTML离线导出含来源、时间与缺口');
 const csv=await(await req('/comparisons/'+c.id+'/export?format=csv')).text();assert.ok(csv.includes('原文片段')&&csv.includes('招生年度'));checks.push('CSV离线导出含证据列');
 const invalid=await req('/reviews','POST',{programId:id,key:'tuition',verdict:'revised',note:'测试不受支持的值',actor:'AI代理',value:'免费'});assert.equal(invalid.status,400);checks.push('无原文修订被拒绝');
 const saved=await req('/reviews','POST',{programId:id,key:'specialist',verdict:'correct',note:'隔离验收库：核对保存流程，不计入正式复核统计',actor:'AI代理'});assert.equal(saved.status,201);assert.equal((await saved.json()).actor,'AI代理');checks.push('复核保存与身份标记');
 assert.equal((await req('/settings','PUT',{offline:false},'https://example.com')).status,403);checks.push('拒绝跨站写入');
 await stop();
 const code=`import {put} from './server/db.ts';put('jobs',{id:'interruption-case',ownerPid:99999999,input:{kind:'search',year:2027,targets:[]},status:'running',stage:'测试',startedAt:new Date().toISOString(),logs:[],searches:[],modelCalls:0,usage:{input:0,output:0},downloads:0,bytes:0,cacheHits:0,sourceIds:[],programIds:[],issues:[]});`;
 execFileSync(process.execPath,['--input-type=module','-e',code],{cwd:root,env,stdio:'pipe'});
 await start();const selections=await(await req('/selections')).json();assert.ok(selections.find((s:any)=>s.id===id&&s.candidate&&s.watched));checks.push('重启后候选与关注恢复');
 const interrupted=await(await req('/jobs/interruption-case')).json();assert.equal(interrupted.status,'interrupted');checks.push('进程中断后保留记录并标记中断');
 const reports=await(await req('/comparisons')).json();assert.ok(reports.find((r:any)=>r.id===c.id));checks.push('报告快照刷新与重启恢复');
 fs.mkdirSync(path.join(root,'artifacts','evaluation'),{recursive:true});fs.writeFileSync(path.join(root,'artifacts','evaluation','api-acceptance.json'),JSON.stringify({at:new Date().toISOString(),mode:'隔离临时数据库，APP_OFFLINE=1，无付费接口调用',checks,passed:checks.length},null,2));console.log(JSON.stringify({passed:checks.length,checks},null,2));
}finally{await stop();if(!temp.startsWith(path.resolve(os.tmpdir())+path.sep))throw new Error('临时目录校验失败');fs.rmSync(temp,{recursive:true,force:true});}

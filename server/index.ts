import express from 'express';
import {historyForProgram,programInsights} from './enrichment.ts';
import path from 'node:path';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {config,root,readiness,redact} from './config.ts';
import {get,all,put,remove,programs,sources,jobs,reviews,comparisons,interrupt,transaction} from './db.ts';
import {SCHOOLS,SPECIALTIES} from '../shared/schools.ts';
import {FIELDS} from '../shared/types.ts';
import type {Program,Review,Comparison,Source,Fact,FieldKey} from '../shared/types.ts';
import {createJob,activeJob} from './jobs.ts';
import {resolveProof,normalize,validSubject} from './rules.ts';
import {csv,html} from './reports.ts';
import {seed} from './seed.ts';
seed();
interrupt();
if(process.env.APP_OFFLINE===undefined)config.offline=!!get<{id:string;offline:boolean}>('settings','runtime')?.offline;
const app=express();app.disable('x-powered-by');
app.use((req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');if(!['127.0.0.1','localhost'].includes(req.hostname))return res.status(403).json({error:'仅接受本机Host'});const origin=req.headers.origin;if(!['GET','HEAD','OPTIONS'].includes(req.method)&&origin){try{const u=new URL(origin);if(u.protocol!=='http:'||!['127.0.0.1','localhost'].includes(u.hostname)||![String(config.port),'5327'].includes(u.port))return res.status(403).json({error:'仅接受本地工作台操作'});}catch{return res.status(403).json({error:'仅接受本地工作台操作'});}}next();});
app.use(express.json({limit:'64kb'}));
app.get('/api/health',(_req,res)=>res.json({...readiness(),activeJob:activeJob(),version:'0.1.0'}));
app.get('/api/catalog',(_req,res)=>res.json({schools:SCHOOLS,specialties:SPECIALTIES,fields:FIELDS,year:2027}));
app.get('/api/programs',(req,res)=>{const q=String(req.query.q||'');res.json(programs().filter(p=>(!q||JSON.stringify([p.school,p.name,p.college,p.code,p.direction]).includes(q))&&(!req.query.schoolId||p.schoolId===req.query.schoolId)&&(!req.query.year||p.year===Number(req.query.year))));});
app.get('/api/programs/:id',(req,res)=>{const p=get<Program>('programs',String(req.params.id));res.status(p?200:404).json(p||{error:'未找到专业'});});
function publicSource(s:Source){const roster=s.blocks.some(b=>/考生编号|考生姓名|姓名[\s\S]{0,120}初试/.test(b.text));return roster?{...s,tables:[],blocks:s.blocks.map(b=>({...b,text:'名单原文包含个人信息，平台提供汇总结果；完整材料请查看学校原文。'}))}:s;}
app.get('/api/sources',(_req,res)=>res.json(sources().map(publicSource)));
app.get('/api/sources/:id',(req,res)=>{const s=get<Source>('sources',String(req.params.id));res.status(s?200:404).json(s?publicSource(s):{error:'来源不存在'});});
app.get('/api/programs/:id/history',(req,res)=>{const p=get<Program>('programs',String(req.params.id));if(!p)return res.status(404).json({error:'专业不存在'});res.json(historyForProgram(p));});
app.get('/api/programs/:id/insights',(req,res)=>{const p=get<Program>('programs',String(req.params.id));if(!p)return res.status(404).json({error:'专业不存在'});res.json(programInsights(p.schoolId,p.code));});
app.get('/api/history',(_req,res)=>res.json(all('admission_history')));
app.get('/api/insights',(_req,res)=>res.json(all('program_insights')));
app.get('/api/selections',(_req,res)=>res.json(all('selections')));
app.put('/api/programs/:id/selection',(req,res)=>{const id=String(req.params.id);if(!get('programs',id))return res.status(404).json({error:'专业不存在'});const v=z.object({candidate:z.boolean(),watched:z.boolean()}).parse(req.body);put('selections',{id,...v});res.json({id,...v});});
app.get('/api/jobs',(_req,res)=>res.json(jobs()));
app.get('/api/jobs/:id',(req,res)=>{const j=get('jobs',String(req.params.id));res.status(j?200:404).json(j||{error:'任务不存在'});});
app.get('/api/jobs/:id/checklist',(req,res)=>{const id=String(req.params.id);if(!get('jobs',id))return res.status(404).json({error:'任务不存在'});res.json(get('settings','retest-checklist-'+id)||{checked:[],note:''});});
app.put('/api/jobs/:id/checklist',(req,res)=>{const id=String(req.params.id);const job=get<import('../shared/types.ts').Job>('jobs',id);if(!job?.retest)return res.status(404).json({error:'复试参考结果不存在'});const body=z.object({checked:z.array(z.number().int().min(0).max(job.retest.questions.length-1)).max(6),note:z.string().max(2000)}).parse(req.body);const record={id:'retest-checklist-'+id,...body,checked:[...new Set(body.checked)],updatedAt:new Date().toISOString()};put('settings',record);res.json(record);});
const input=z.object({kind:z.enum(['search','recheck','answer','discover','retest_advice','admission_history','program_insights']),year:z.number().int().min(2024).max(2030),targets:z.array(z.object({schoolId:z.string().max(20),code:z.string().regex(/^\d{6}$/),name:z.string().min(1).max(50)})).max(3).default([]),nameTargets:z.array(z.object({schoolId:z.string().max(20),name:z.string().trim().min(2).max(50)})).min(1).max(3).optional(),schoolId:z.string().max(20).optional(),college:z.string().trim().max(80).optional(),programIds:z.array(z.string().max(80)).max(3).optional(),question:z.string().max(1000).optional()});
app.post('/api/jobs',(req,res)=>{if(activeJob())return res.status(409).json({error:'已有任务运行中',jobId:activeJob()});const j=createJob(input.parse(req.body));res.status(202).json(j);});
app.get('/api/versions',(req,res)=>res.json(all<any>('versions').filter(v=>!req.query.programId||v.programId===req.query.programId)));
app.get('/api/reviews',(_req,res)=>res.json(reviews()));
app.post('/api/reviews',(req,res)=>{
 const body=z.object({programId:z.string(),key:z.enum(Object.keys(FIELDS) as [FieldKey,...FieldKey[]]),verdict:z.enum(['correct','missing','conflict','revised']),note:z.string().min(1).max(2000),actor:z.enum(['AI代理','用户']),value:z.string().max(1000).optional(),proof:z.object({sourceId:z.string(),blockId:z.string(),quote:z.string()}).optional()}).parse(req.body);
 const p=get<Program>('programs',body.programId);if(!p)return res.status(404).json({error:'专业不存在'});const before=p.facts[body.key];if(!before)return res.status(400).json({error:'字段不存在'});
 let after:Fact={...before};
 if(body.verdict==='correct'){if(!before.proofs.length||before.state!=='supported')return res.status(400).json({error:'请先补齐原文支持，不能把缺口直接确认为正确'});after.review=body.actor==='用户'?'user_confirmed':'ai_checked';}
 if(body.verdict==='missing')after={...after,state:'missing',note:body.note};
 if(body.verdict==='conflict')after={...after,state:'conflict',note:body.note};
 if(body.verdict==='revised'){
  const proof=resolveProof(body.proof||{},sources(),p.year);const source=proof&&get<Source>('sources',proof.sourceId);
  if(!body.value||!proof||source?.schoolId!==p.schoolId||!normalize(proof.quote).includes(normalize(body.value))||!validSubject(body.key,body.value))return res.status(400).json({error:'修订须提供本校当年原文定位，且值必须出现在引用中、科目代码与名称一致'});
  after={...after,value:body.value,proofs:[proof],state:source.kind==='preliminary'||source.kind==='unknown'?'clue':'supported',review:body.actor==='用户'?'user_confirmed':'ai_checked',checkedAt:new Date().toISOString(),note:body.note};
 }
 const review:Review={id:randomUUID(),programId:p.id,key:body.key,before,after,verdict:body.verdict,note:body.note,actor:body.actor,at:new Date().toISOString()};p.facts[body.key]=after;
 transaction(()=>{put('reviews',review);put('programs',p);});res.status(201).json(review);
});
app.post('/api/comparisons',(req,res)=>{const ids=z.array(z.string()).min(1).max(3).parse(req.body.programIds);if(new Set(ids).size!==ids.length)return res.status(400).json({error:'专业重复'});const list=ids.map(id=>get<Program>('programs',id));if(list.some(p=>!p))return res.status(404).json({error:'专业不存在'});if(new Set(list.map(p=>p!.year)).size>1)return res.status(400).json({error:'请选择同一招生年度的专业'});const c:Comparison={id:randomUUID(),programIds:ids,createdAt:new Date().toISOString(),programs:list as Program[],history:[...new Map((list as Program[]).flatMap(historyForProgram).map(h=>[h.id,h])).values()],insights:[...new Map((list as Program[]).flatMap(p=>programInsights(p.schoolId,p.code)).map(i=>[i.id,i])).values()]};put('comparisons',c);res.status(201).json(c);});
app.get('/api/comparisons',(_req,res)=>res.json(comparisons()));
app.get('/api/comparisons/:id/export',(req,res)=>{const c=get<Comparison>('comparisons',String(req.params.id));if(!c)return res.status(404).json({error:'报告不存在'});if(req.query.format==='csv'){res.setHeader('Content-Disposition','attachment; filename="yantu-comparison.csv"');res.type('text/csv; charset=utf-8').send(csv(c));}else{res.setHeader('Content-Disposition','attachment; filename="yantu-report.html"');res.type('html').send(html(c));}});
app.put('/api/settings',(req,res)=>{const {offline}=z.object({offline:z.boolean()}).parse(req.body);if(activeJob())return res.status(409).json({error:'请等待当前任务完成再切换模式'});config.offline=offline;put('settings',{id:'runtime',offline});res.json(readiness());});
app.get('/article.html',(_req,res)=>res.status(404).send('未找到该页面'));
const dist=path.join(root,'dist');if(fs.existsSync(dist)){app.use(express.static(dist));app.get('/{*path}',(_req,res)=>res.sendFile(path.join(dist,'index.html')));}
app.use((error:any,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{res.status(error instanceof z.ZodError?400:400).json({error:error instanceof z.ZodError?'请求参数不符合要求':redact(error.message||'操作失败')});});
app.listen(config.port,'127.0.0.1',()=>console.log('研途有据 http://127.0.0.1:'+config.port));

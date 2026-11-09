import {createHash} from 'node:crypto';
import type {AdmissionHistory,HistoryMetric,Source,Target,Proof,ProgramInsight} from '../shared/types.ts';
import {normalize,actualSpan} from './rules.ts';
import {school} from '../shared/schools.ts';
export const historyId=(schoolId:string,year:number,code:string,mode='全日制')=>'hist-'+createHash('sha256').update([schoolId,year,code,mode].join('|')).digest('hex').slice(0,20);
const number=(s:string)=>/^\d+(?:\.\d+)?$/.test(s.trim())?Number(s):undefined;
const firstChoice=(s:string):HistoryMetric['track']=>/一志愿/.test(s)?'first_choice':/调剂/.test(s)?'transfer':'unknown';
export function historyFromTables(docs:Source[],target:Target,year:number,jobId:string):AdmissionHistory{
 const record:AdmissionHistory={id:historyId(target.schoolId,year,target.code),schoolId:target.schoolId,year,college:'以各项原文为准',code:target.code,name:target.name,mode:'全日制',metrics:[],rules:[],sourceIds:[],issues:[],checkedAt:new Date().toISOString(),jobId};
 const seen=new Set<string>();
 const unique=docs.filter((s,i,a)=>a.findIndex(x=>x.hash===s.hash)===i);
 for(const s of unique.filter(s=>!s.error&&s.role!=='public_account'&&s.schoolId===target.schoolId&&s.year===year))for(const table of mergedTables(s)){
  const heads=table.headers.map(normalize),index=(test:RegExp)=>heads.findIndex(h=>test.test(h));
  const ci=index(/专业代码|^专业$|报考专业|拟录取专业/),ni=index(/专业名称|报考专业名称/),mi=index(/学习形式|学习方式/),college=index(/学院名称|^学院$|院系|招生学院/);
  if(ci<0)continue;
  const matching=table.rows.filter(r=>{const identity=[r.cells[ci],ni>=0?r.cells[ni]:''].join('');return (identity.includes(target.code)||normalize(identity)===normalize(target.name))&&!/非全日制/.test(mi>=0?r.cells[mi]||'':'')&&!(college>=0&&r.cells[college]&&(!/计算机/.test(r.cells[college])||/联培|专项|中外|中心|研究院/.test(r.cells[college])));});
  if(!matching.length)continue;
  const originalTrack=firstChoice(s.title), scoreIndex=index(/^初试总分$|^初试成绩$|^初试总成绩$|^总分$/),personIndex=index(/考生编号/),planIndex=index(/专项计划|备注.*专项|^备注$/),statusIndex=index(/录取状态|是否.*录取/);
  // A results sheet is not an admissions list. Its title must explicitly identify the stage.
  const stage:HistoryMetric['stage']=/拟录取.*名单|拟录取.*公示|拟录取结果/.test(s.title)?'admitted':/复试名单/.test(s.title)?'retest_roster':personIndex>=0?'retest_results':'official';
  const proof=(row:typeof matching[number]):Proof=>{const block=s.blocks.find(b=>b.id===row.blockId)!;let quote=block?.text||'';for(let i=0;i<heads.length;i++)if(/姓名|考生编号|证件/.test(heads[i])&&row.cells[i])quote=quote.replaceAll(row.cells[i],'[个人信息已隐藏]');return {sourceId:s.id,blockId:row.blockId,quote,locator:row.locator};};
  const add=(m:HistoryMetric)=>{const id=[s.hash,table.name,m.key,m.scope].join('|');if(!seen.has(id)){seen.add(id);record.metrics.push(m);if(!record.sourceIds.includes(s.id))record.sourceIds.push(s.id);}};
  if(personIndex<0){
   const specs:[string,string,RegExp,string][]=[['cutoff','官方复试总分线',/学校复试分数线|最低复试分数|^总分$|一志愿考生复试分数线/,'分'],['applicants','报名人数',/报名人数/,'人'],['nationalPass','达国家线人数',/达国家线人数/,'人'],['admittedCount','官方公布录取人数',/^录取人数$/,'人'],['recommended','推免生人数',/推免生人数/,'人'],['special','专项计划人数',/士兵计划人数/,'人'],['plan','公布招生计划',/^招生计划$/,'人'],['single100','单科线（满分100）',/单科.*(?:=100|≤100)/,'分'],['single150','单科线（满分大于100）',/单科.*>100/,'分']];
   for(const row of matching){const mode=mi>=0?row.cells[mi]:'未列明学习形式';const col=college>=0?row.cells[college]:'原表未列学院';if(college>=0&&col)record.college=col;
    for(const [key,label,re,unit] of specs){const idx=index(re),v=idx>=0?number(row.cells[idx]||''):undefined;if(v===undefined)continue;add({key,label,value:v,unit,scope:[col,target.code,mode,'原表口径；空白不作零值'].join(' / '),stage:'official',track:originalTrack,plan:planIndex>=0&&/士兵|退役|少数民族|专项/.test(row.cells[planIndex]||'')?'special':'unknown',mode,basis:'official_total',proofs:[proof(row)]});}
   }
  }else if(scoreIndex>=0){
   const cohorts=new Map<string,typeof matching>();
   const people=new Set<string>();
   for(const row of matching){const person=row.cells[personIndex];if(person&&people.has(person))continue;if(person)people.add(person);const mode=mi>=0?row.cells[mi]:'未列明学习形式',special=planIndex>=0?row.cells[planIndex]:'',plan:HistoryMetric['plan']=/普通计划/.test(special)?'ordinary':/士兵|少数民族|专项|退役/.test(special)?'special':'unknown';
    if(statusIndex>=0&&stage==='admitted'&&!/^(拟录取|是)$/.test(row.cells[statusIndex]||''))continue;
    const key=[mode,plan].join('|');cohorts.set(key,[...(cohorts.get(key)||[]),row]);
   }
   for(const [key,rows] of cohorts){const [mode,plan]=key.split('|') as [string,HistoryMetric['plan']];const scores=rows.map(r=>number(r.cells[scoreIndex]||'')).filter((x):x is number=>x!==undefined&&x>=0&&x<=500).sort((a,b)=>a-b);if(!scores.length)continue;
    const scope=[table.name,mode,originalTrack==='first_choice'?'一志愿':originalTrack==='transfer'?'调剂':'志愿批次未列明',plan==='ordinary'?'普通计划':plan==='special'?'专项计划':'计划类别未列明'].join(' / ');
    const refs=rows.map(r=>({sourceId:s.id,blockId:r.blockId}));const base={scope,stage,track:originalTrack,plan,mode,basis:'acquired_sample' as const,proofs:[proof(rows[0]),...(rows.length>1?[proof(rows.at(-1)!)]:[])],sampleSize:rows.length,rowRefs:refs};
    const n=scores.length,median=n%2?scores[(n-1)/2]:(scores[n/2-1]+scores[n/2])/2;
    const label=stage==='admitted'?'拟录取名单样本':stage==='retest_roster'?'复试名单样本':'复试成绩样本';
    add({...base,key:'sampleCount',label:label+'人数',value:rows.length,unit:'人',formula:'按来源表的专业、学习形式和计划类别分组计数；不代表全年度总数'});
    for(const [k,v,l] of [['min',scores[0],'最低'],['median',median,'中位'],['max',scores.at(-1)!,'最高']] as const){const values=k==='median'?[scores[Math.floor((n-1)/2)],scores[Math.floor(n/2)]]:[v];const supporting=rows.filter(r=>values.includes(number(r.cells[scoreIndex]||'')??-1));add({...base,key:'score'+k,label:label+'初试'+l+'分',value:v,unit:'分',sampleSize:n,proofs:supporting.slice(0,2).map(proof),formula:k==='median'?'有效初试分数排序，中间一项或两项均值；仅该份名单':'有效初试分数排序取'+l+'值；仅该份名单'});}
   }
  }
 }
 const merged:HistoryMetric[]=[];for(const m of record.metrics){const same=merged.find(x=>x.key===m.key&&x.scope===m.scope&&x.value===m.value&&x.stage===m.stage);if(same)same.proofs.push(...m.proofs.filter(p=>!same.proofs.some(q=>q.sourceId===p.sourceId&&q.blockId===p.blockId)));else merged.push(m);}record.metrics=merged;
 for(const m of merged){if(m.stage==='official'&&merged.some(x=>x!==m&&x.stage==='official'&&x.key===m.key&&x.mode===m.mode&&x.plan===m.plan&&x.track===m.track&&x.scope===m.scope&&x.value!==m.value)){m.conflict=true;if(!record.issues.some(s=>s.startsWith(m.label+'存在冲突')))record.issues.push(m.label+'存在冲突，保留不同来源数值，未选择其中一个作为结论。');}}
 if(!record.metrics.length)record.issues.push('未取得可可靠解析且对应本专业的历史统计表；缺失项不推算。');
 if(!record.metrics.some(m=>m.stage==='admitted'||m.key==='admittedCount'))record.issues.push('未取得对应口径的拟录取统计；复试成绩不能替代录取结果。');
 return record;
}
function mergedTables(s:Source){const map=new Map<string,NonNullable<Source['tables']>[number]>();for(const t of s.tables||[]){const key=t.headers.map(normalize).join('|');const old=map.get(key);if(old)old.rows.push(...t.rows);else map.set(key,{...t,name:'原文同表头记录（各行保留页码或表格位置）',rows:[...t.rows]});}return [...map.values()];}
export function validatedHistoryRules(raw:any,docs:Source[],target:Target,year:number){
 const allowed=['复试科目','成绩权重','考核形式','差额比例','调剂要求','培养要求','学费学制','咨询方式'];
 const out:AdmissionHistory['rules']=[];
 for(const item of Array.isArray(raw?.rules)?raw.rules:[]){const s=docs.find(s=>s.id===item.sourceId&&s.schoolId===target.schoolId&&s.year===year&&s.role!=='public_account'&&s.kind!=='preliminary');const b=s?.blocks.find(b=>b.id===item.blockId);if(!s||!b||!allowed.includes(item.label)||typeof item.quote!=='string'||item.quote.length>600)continue;
  const quote=actualSpan(b.text,item.quote);if(!quote||/MBA|MPA|工商管理|公共管理|会计专业/.test(quote))continue;
  if(/学院/.test(s.title)&&!/计算机|软件|人工智能|各学院|学校/.test(s.title))continue;
  if(/\b\d{6}\b/.test(quote)&&!quote.includes(target.code)&&!quote.includes(target.name))continue;
  out.push({label:item.label,scope:quote.includes(target.code)||quote.includes(target.name)?target.name:'学校或学院规则，具体适用对象见原文',proof:{sourceId:s.id,blockId:b.id,quote,locator:b.locator}});
 }
 return out.slice(0,12);
}
export function validateInsights(raw:any,docs:Source[],targets:Target[],jobId:string):ProgramInsight[]{
 const out:ProgramInsight[]=[];
 for(const item of Array.isArray(raw?.insights)?raw.insights:[]){const s=docs.find(s=>s.id===item.sourceId&&!s.error),b=s?.blocks.find(b=>b.id===item.blockId);if(!s||!b||!targets.some(t=>t.schoolId===s.schoolId)||!['备考经历','复试经历','培养要求','就业讨论'].includes(item.topic)||typeof item.quote!=='string'||item.quote.length>400)continue;
  const quote=actualSpan(b.text,item.quote);if(!quote||!/计算机|软件|408|复试|就业|培养|数学/.test(quote))continue;
  if(item.topic==='培养要求'&&!/培养方案|学分|学位论文|毕业要求|课程|学制|学费|培养方式|实践要求/.test(quote))continue;
  if(/加群|群号|押题|购买|售课|扫码/.test(quote))continue;
  const text=s.title+' '+s.blocks.map(b=>b.text).join(' ');if(!text.includes(school(s.schoolId).name)&&s.role==='public_account')continue;if(!/硕士|研究生|考研|专硕|学硕/.test(text)||/本科毕业生|本科生就业|本科招生|高考/.test(quote))continue;
  const author=typeof item.author==='string'&&text.includes(item.author)?item.author:'作者身份未核实';
  const experienceYear=Number.isInteger(item.experienceYear)&&new RegExp(item.experienceYear+'年?').test(quote)&&item.experienceYear>=2020&&item.experienceYear<=2030?item.experienceYear:null;
  const codes=targets.filter(t=>t.schoolId===s.schoolId).map(t=>t.code);if(!codes.length)continue;
  out.push({id:'ins-'+createHash('sha256').update(s.url+item.topic+normalize(quote)).digest('hex').slice(0,20),schoolId:s.schoolId,codes,topic:item.topic,nature:s.role==='public_account'?/noobdream\.com/.test(s.url)?'editorial_analysis':'personal_account':'official_material',title:s.title,author,publishedAt:s.publishedAt,experienceYear,scope:codes.some(code=>quote.includes(code))?'原文明确涉及所列代码；方向和学习形式仍需核对':'本校计算机相关材料，具体招生专业、方向及学习形式未独立核实',quote,url:s.url,status:'original_acquired',proof:{sourceId:s.id,blockId:b.id,quote,locator:b.locator},relatedUrls:[],checkedAt:new Date().toISOString(),jobId});
 }
 return out;
}

import {createHash} from 'node:crypto';
import {isIP} from 'node:net';
import {school,ownedHost} from '../shared/schools.ts';
import type {RetestLead,RetestFinding,Source,Target,NameTarget} from '../shared/types.ts';
import {normalize,resolveProof,actualSpan} from './rules.ts';
import {publicIp} from './documents.ts';

export const RETEST_TOPICS=['复试科目','成绩权重','差额比例','调剂条件','公示与回应','咨询与申诉'] as const;
export const RETEST_QUESTIONS=[
 '请向学院确认当年复试科目、考核形式与参考范围，往年材料是否仍适用？',
 '请核对初试、复试的成绩计算方式，以及单项不合格或加试的处理规则。',
 '请核对当年的差额比例、招生计划口径和调剂条件，是否区分学习形式与专项？',
 '请核对复试过程记录、公示与异议受理程序，并保存官方咨询渠道。',
 '如关注某条争议信息，请先核对原始出处、发生年度及所属学院，再向招生单位询问对应规则或回应。',
 '未检索到相关信息仅表示本次材料不足，不能据此判断复试是否公平。',
];
function scopeAllowed(title:string,text:string,college:string){
 if(!college)return true;
 const general=/(各学院|各招生|全校|各研究生培养单位)/;
 if(title.includes('学院')&&!title.includes(college)&&!general.test(title))return false;
 return !/[\u4e00-\u9fff]{2,14}学院/.test(text)||text.includes(college)||general.test(text);
}
export function referenceYears(year:number){return [year,...[year-1,year-2,year-3]];}
export function safeLeadUrl(raw:string){
 try{const u=new URL(raw);if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.port&&!['80','443'].includes(u.port))return;
  if(u.hostname==='localhost'||!u.hostname.includes('.')||u.hostname.endsWith('.local')||isIP(u.hostname)&&!publicIp(u.hostname))return;
  u.hash='';for(const key of [...u.searchParams.keys()])if(/^(utm_|spm$|from$|share)/i.test(key))u.searchParams.delete(key);return u.href;
 }catch{return;}
}
export function leadFromPage(page:Record<string,unknown>,schoolId:string,college=''):RetestLead|undefined{
 const url=safeLeadUrl(String(page.url||page.Url||''));if(!url)return;
 const title=String(page.title||page.Title||'').slice(0,240);
 if(/推免|推荐免试|博士|夏令营/.test(title))return;
 const summary=String(page.passage||page.content||page.summary||page.snippet||'').slice(0,1400);
 const text=title+' '+summary,s=school(schoolId),official=ownedHost(new URL(url).hostname,schoolId);
 // A school-restricted query does not prove that each returned result belongs to that school.
 if(!text.includes(s.name)&&!(official&&new URL(url).hostname!=='yz.chsi.com.cn'))return;
 if(!/复试|调剂|录取.*(争议|回应|公示)|申诉/.test(text))return;
 const names=[...text.matchAll(/[\u4e00-\u9fff]{2,14}学院/g)].map(m=>m[0]);
 if(college&&names.length&&!text.includes(college)&&!/(全校|各学院|各招生|学校.*办法)/.test(text))return;
 const years=[...new Set((title.match(/20\d{2}/g)||[]).map(Number))];
 return {id:'lead-'+createHash('sha256').update(url).digest('hex').slice(0,16),url,title,summary,
  year:years.length===1?years[0]:null,publishedAt:page.date?String(page.date).slice(0,50):null,
  scope:college&&text.includes(college)?college:'学校层面或适用学院待核对',official,status:'search_only',relatedUrls:[]};
}
export function dedupeLeads(leads:RetestLead[]){
 const out:RetestLead[]=[];
 for(const lead of leads){const core=normalize(lead.title).replace(/[-_|—].*$/,'').replace(/[【】《》“”]/g,'');
  const existing=out.find(x=>x.url===lead.url||x.year===lead.year&&((core.length>=12&&core===normalize(x.title).replace(/[-_|—].*$/,'').replace(/[【】《》“”]/g,''))||(lead.summary.length>=80&&normalize(x.summary).slice(0,100)===normalize(lead.summary).slice(0,100))));
  if(!existing){out.push({...lead,relatedUrls:[...lead.relatedUrls]});continue;}
  if(lead.url!==existing.url&&!existing.relatedUrls.includes(lead.url))existing.relatedUrls.push(lead.url);
  if(lead.official&&!existing.official){const related=[existing.url,...existing.relatedUrls.filter(x=>x!==lead.url)];Object.assign(existing,lead,{relatedUrls:[...new Set(related)]});}
 }
 return out;
}
export function retestEvidence(docs:Source[],year:number,college:string){
 return docs.filter(s=>!s.error&&s.year!==null&&referenceYears(year).includes(s.year)).flatMap(s=>s.blocks.filter(b=>/复试|调剂|权重|差额|申诉|公示|咨询|举报/.test(b.text)).map(b=>({sourceId:s.id,blockId:b.id,year:s.year,title:s.title,scope:college&&b.text.includes(college)?college:'学校层面，学院适用性待核对',text:b.text}))).slice(0,50);
}
export function validateRetestFindings(raw:any,docs:Source[],schoolId:string,year:number,college:string):RetestFinding[]{
 const accepted:RetestFinding[]=[];
 for(const item of Array.isArray(raw?.findings)?raw.findings:[]){
  if(!RETEST_TOPICS.includes(item.topic))continue;
  const source=docs.find(s=>s.id===item.sourceId&&s.schoolId===schoolId);
  if(!source||source.kind==='preliminary'||source.year===null||!referenceYears(year).includes(source.year)||/推免|推荐免试|博士|夏令营/.test(source.title))continue;
  const proof=resolveProof(item,[source],source.year);if(!proof||proof.quote.length>700)continue;
  const block=source.blocks.find(b=>b.id===proof.blockId)!;
  // Never let a quote from another named college become advice for this college.
  if(!scopeAllowed(source.title,block.text,college)||!scopeAllowed(source.title,proof.quote,college))continue;
  const quote=actualSpan(block.text,proof.quote);if(!quote)continue;
  const scope=college&&quote.includes(college)?college:/MBA|MPA|工商管理|公共管理|会计专业/.test(quote)?'适用对象以摘录所列专业为准':'学校层面，学院适用性待核对';
  if(!accepted.some(x=>x.topic===item.topic&&x.proof.sourceId===source.id&&normalize(x.proof.quote)===normalize(quote)))accepted.push({topic:item.topic,year:source.year,scope,proof:{...proof,quote}});
 }
 return accepted.slice(0,24);
}
export function validateDiscoveredTargets(raw:any,docs:Source[],requested:NameTarget[],year:number):Target[]{
 const targets:Target[]=[];
 for(const item of Array.isArray(raw?.targets)?raw.targets:[]){
  const request=requested.find(t=>t.schoolId===item.schoolId&&normalize(t.name)===normalize(item.name));
  if(!request||!/^\d{6}$/.test(String(item.code)))continue;
  const source=docs.find(s=>s.id===item.sourceId&&s.schoolId===request.schoolId&&s.year===year&&['formal','notice'].includes(s.kind)&&/招生.*目录/.test(s.title));
  const proof=source&&resolveProof(item,[source],year);
  if(!proof||!normalize(proof.quote).includes(normalize(request.name)))continue;
  const q=normalize(proof.quote),name=normalize(request.name),code=String(item.code);
  // Require a local identity pair; a code elsewhere in a large table is insufficient.
  if(![name+'('+code+')',name+code,code+name,code+'|'+name,name+'|'+code,code+'：'+name,code+':'+name,code+')'+name,code+'('+name+')'].some(pair=>q.includes(pair)))continue;
  if(!targets.some(t=>t.schoolId===request.schoolId&&t.code===code))targets.push({...request,code});
 }
 return targets.slice(0,3);
}

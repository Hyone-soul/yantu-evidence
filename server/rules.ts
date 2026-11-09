import {createHash} from 'node:crypto';
import {FIELDS} from '../shared/types.ts';
import type {Program,Fact,FieldKey,Source,Proof,Target} from '../shared/types.ts';
import {school} from '../shared/schools.ts';
export const normalize=(s:string)=>String(s).replace(/[\s\u3000]+/g,'').replace(/[（]/g,'(').replace(/[）]/g,')');
// Resolve a verbatim span ourselves. Model-written ellipses are never stored as quotations.
export function actualSpan(text:string,value:string){const wanted=normalize(value);if(!wanted)return;let norm='',offsets:number[]=[];for(let i=0;i<text.length;i++){const c=normalize(text[i]);if(c){norm+=c;offsets.push(i);}}const at=norm.indexOf(wanted);if(at<0)return;return text.slice(offsets[at],offsets[at+wanted.length-1]+1);}
export function programRegion(text:string,code:string,college=''){const collegeSpan=actualSpan(text,college);const collegeAt=collegeSpan?text.indexOf(collegeSpan):0;const at=text.indexOf(code,collegeAt);if(at<0)return '';const start=text.lastIndexOf('00不区分研究方向',at),end=text.indexOf('00不区分研究方向',at+6);if(start>=0)return text.slice(start,end<0?text.length:end);const lines=text.slice(Math.max(0,collegeAt)).split('\n');const i=lines.findIndex(l=>l.includes(code));return lines.slice(Math.max(0,i-3),i+9).join('\n');}
export function programId(p:Pick<Program,'schoolId'|'year'|'college'|'code'|'name'|'direction'|'degree'|'mode'>){return 'p-'+createHash('sha256').update(JSON.stringify([p.schoolId,p.year,p.college,p.code,p.name,p.direction,p.degree,p.mode].map(String))).digest('hex').slice(0,20);}
export function resolveProof(raw:any,sources:Source[],year:number):Proof|undefined{
 const s=sources.find(s=>s.id===raw.sourceId);const block=s?.blocks.find(b=>b.id===raw.blockId);
 if(!s||s.error||s.year!==year||!block||typeof raw.quote!=='string'||raw.quote.length<2||raw.quote.length>1400||!normalize(block.text).includes(normalize(raw.quote)))return;
 return {sourceId:s.id,blockId:block.id,quote:raw.quote,locator:block.locator};
}
export function validSubject(key:string,value:string){
 if(!['politics','english','math','specialist'].includes(key))return true;
 const known:Record<string,RegExp>={'101':/思想政治/,'201':/英语.*一/,'204':/英语.*二/,'301':/数学.*一/,'302':/数学.*二/,'303':/数学.*三/,'408':/计算机.*(基础|综合)/};
 const code=value.match(/\b(101|201|204|301|302|303|408)\b/)?.[1];return !code||known[code].test(value);
}
export function validateExtraction(raw:any,sourceList:Source[],targets:Target[],year:number,jobId:string){
 const accepted:Program[]=[];const issues:string[]=[];
 const entries=(Array.isArray(raw.programs)?raw.programs:[]).flatMap((p:any)=>typeof p.mode==='string'&&p.mode.includes('非全日制')&&p.mode.replace(/非全日制/g,'').includes('全日制')?['全日制','非全日制'].map(mode=>({...p,mode,facts:(p.facts||[]).map((f:any)=>f.key==='mode'?{...f,value:mode}:f)})):[p]);
 for(const item of entries){
  const target=targets.find(t=>t.code===item.code&&t.schoolId===item.schoolId);if(!target){issues.push('模型返回非目标专业，已拒绝');continue;}
  let identity=resolveProof(item.identity||{},sourceList,year);const s=sourceList.find(s=>s.id===item.identity?.sourceId&&s.year===year&&!s.error);const block=s?.blocks.find(b=>b.id===item.identity?.blockId);
  const name=String(item.name||'');
  if(!identity&&s&&block){const exact=actualSpan(block.text,name+'（'+item.code+'）')||actualSpan(block.text,item.code+name);if(exact)identity={sourceId:s.id,blockId:block.id,quote:exact,locator:block.locator};}
  if(!identity||!s||s.schoolId!==target.schoolId||!normalize(identity.quote).includes(item.code)||!name||!normalize(identity.quote).includes(normalize(name))){issues.push(target.code+'：专业身份无原文定位，未入库');continue;}
  const college=String(item.college||'未定位学院'),direction=String(item.direction||'未定位方向'),degree=String(item.degree||'未定位'),mode=String(item.mode||'未定位');
  const p:Program={id:'',schoolId:target.schoolId,school:school(target.schoolId).name,year,college,code:item.code,name,direction,degree,mode,facts:{},updatedAt:new Date().toISOString(),jobId};p.id=programId(p);
  for(const key of Object.keys(FIELDS) as FieldKey[])p.facts[key]={key,value:'未取得可定位的当年资料',scope:'当前专业组合',year,state:'missing',proofs:[],checkedAt:p.updatedAt,review:'extracted'};
  for(const f of Array.isArray(item.facts)?item.facts:[]){
    if(!(f.key in FIELDS)||typeof f.value!=='string'||!f.value.trim())continue;
    const proof=resolveProof(f,sourceList,year);const source=sourceList.find(s=>s.id===proof?.sourceId);
    if(!proof||!source||source.schoolId!==p.schoolId||!normalize(proof.quote).includes(normalize(f.value))||!validSubject(f.key,f.value)){issues.push(p.code+' / '+f.key+'：引用、年度或科目对应未通过，保留缺口');continue;}
    const key=f.key as FieldKey;
    if(['politics','english','math','specialist','tuition','duration','plan','retest'].includes(key)){
      const b=source.blocks.find(b=>b.id===proof.blockId)!;const region=programRegion(b.text,p.code,p.college);
      if(b.text.includes(p.code)&&!normalize(region).includes(normalize(f.value))){issues.push(p.code+' / '+key+'：值不在该专业所在行组，已拒绝');continue;}
    }
    const unit=typeof f.unit==='string'&&normalize(source.blocks.find(b=>b.id===proof.blockId)!.text).includes(normalize(f.unit))?f.unit:'';
    const scope=['eligibility','equivalent','crossMajor','planScope'].includes(key)&&f.scope==='全校'?'全校':p.college+' / '+p.code+' / '+p.mode;
    const next:Fact={key,value:f.value,unit,scope,year,state:source.kind==='preliminary'||source.kind==='unknown'?'clue':'supported',proofs:[proof],checkedAt:p.updatedAt,review:'extracted',note:source.kind==='preliminary'?'预公告线索，仍须核对正式目录':undefined};
    const old=p.facts[key];
    if(old&&old.state!=='missing'&&normalize(old.value)!==normalize(next.value)){
      if(old.state==='clue'&&next.state==='supported'){next.note='已取得正式材料；预公告保留在来源记录。';p.facts[key]=next;}
      else if(old.state==='supported'&&next.state==='clue')continue;
      else p.facts[key]={...old,state:'conflict',value:old.value+' ／ '+next.value,proofs:[...old.proofs,...next.proofs],note:'原文存在不同表述，尚未消解。'};
    }else p.facts[key]=next;
  }
  // Identity labels must themselves be located, even when the model supplied plausible labels.
  const context=block?.text||identity.quote,region=programRegion(context,p.code,p.college);
  if(region.includes('不区分研究方向')&&p.facts.direction?.state==='missing')p.direction='不区分研究方向';
  for(const [prop,key] of [['college','college'],['degree','degree'],['mode','mode'],['direction','direction']] as const){const fact=p.facts[key];if(fact&&fact.state!=='missing')p[prop]=fact.value;else{
    const span=actualSpan(prop==='college'||prop==='degree'?context:region,p[prop]);
    if(span&&p[prop]!=='未定位')p.facts[key]={key,value:span,year,state:s.kind==='preliminary'||s.kind==='unknown'?'clue':'supported',scope:'当前专业组合',proofs:[{...identity,quote:span}],checkedAt:p.updatedAt,review:'extracted'};
    else p[prop]='未定位';
  }}
  p.id=programId(p);accepted.push(p);
 }
 return {accepted,issues};
}
export function diffFacts(before:Program,after:Program){return(Object.keys(FIELDS) as FieldKey[]).filter(k=>JSON.stringify([before.facts[k]?.value,before.facts[k]?.state])!==JSON.stringify([after.facts[k]?.value,after.facts[k]?.state])).map(key=>({key,before:before.facts[key],after:after.facts[key]}));}

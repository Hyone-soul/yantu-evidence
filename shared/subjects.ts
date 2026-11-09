import type {Program} from './types.ts';
export interface SubjectFilter {english:string;math:string;specialist:string;}
export function subjectMatch(p:Program,filter:SubjectFilter):'match'|'unknown'|'mismatch'{
 let missing=false;
 for(const key of ['english','math','specialist'] as const){
  const wanted=filter[key];if(!wanted)continue;const f=p.facts[key];
  if(!f||f.state!=='supported'){missing=true;continue;}
  const code=f.value.match(/\b\d{3}\b/)?.[0];if(!code){missing=true;continue;}
  if(wanted==='custom'?code==='408':code!==wanted)return 'mismatch';
 }
 return missing?'unknown':'match';
}
export const reviewLabel=(v:string)=>v==='ai_checked'||v==='AI代理'?'系统核对':v==='user_confirmed'||v==='用户'?'本人确认':'尚待核对';
export const displayStage=(status:string)=>({running:'正在查找与核对资料',complete:'资料已保存',partial:'资料已保存，部分待补充',failed:'本次未取得可用资料',interrupted:'查找中断，已有资料已保存'}[status]||'资料记录');
export const issueText=(text:string)=>text.replace(/AI代理|Qwen|模型|tokens/gi,'资料整理');

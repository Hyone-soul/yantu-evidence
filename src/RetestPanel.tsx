import {issueText,displayStage} from '../shared/subjects.ts';
import {useEffect,useState} from 'react';
import {BookOpen,ExternalLink,Save,Search,History,CheckCircle2} from 'lucide-react';
import {SCHOOLS} from '../shared/schools.ts';
import type {Job,Source,RetestLead} from '../shared/types.ts';
import {api,time} from './ui.tsx';
export function RetestPanel({jobs,sources,year,schoolId,college,reference,disabled,onChange,onRun,onInspect,notify}:{jobs:Job[];sources:Source[];year:number;schoolId:string;college:string;reference:string;disabled:boolean;onChange:(schoolId:string,college:string)=>void;onRun:()=>void;onInspect:(id:string)=>void;notify:(text:string)=>void}){
 const history=jobs.filter(j=>j.input.kind==='retest_advice'&&j.input.year===year&&j.input.schoolId===schoolId&&(j.input.college||'')===college);
 const task=history.find(j=>j.id===reference)||history[0],result=task?.retest;
 const [checked,setChecked]=useState<number[]>([]),[note,setNote]=useState(''),[saving,setSaving]=useState(false);
 useEffect(()=>{let alive=true;setChecked([]);setNote('');if(task)void api<{checked:number[];note:string}>('/jobs/'+task.id+'/checklist').then(v=>{if(alive){setChecked(v.checked);setNote(v.note);}}).catch(e=>{if(alive)notify(e.message);});return()=>{alive=false;};},[task?.id]);
 async function save(){if(!task)return;setSaving(true);try{await api('/jobs/'+task.id+'/checklist','PUT',{checked,note});notify('核对清单已保存，可离线查看');}catch(e){notify((e as Error).message);}finally{setSaving(false);}}
 function leadCard(lead:RetestLead){return <article className="lead-card" key={lead.id}>
  <div className="badges"><span className="tag neutral">{lead.official?'官方入口':'外部检索线索'}</span><span className={'tag '+(lead.status==='original_acquired'?'supported':'clue')}>{lead.status==='original_acquired'?'已取得原文':'未取得原文'}</span></div>
  <a className="source-link" href={lead.url} target="_blank" rel="noreferrer">{lead.title}<ExternalLink size={15}/></a>
  <p className="muted">{lead.year?lead.year+'年材料':'招生年度待核对'} · {lead.scope}</p><p className="muted">发布时间：{lead.publishedAt||'未定位'}</p>
  <p className="muted">{new URL(lead.url).hostname}{lead.relatedUrls.length>0?' · 已合并'+lead.relatedUrls.length+'个重复或转载链接':''}</p>
  {!lead.official&&<p className="callout small">仅供进一步核对，不作为招生事实或公平性判断依据。</p>}
 </article>;}
 return <section className="retest-page">
  <div className="panel retest-search"><div className="form-grid"><label>学校<select aria-label="复试参考学校" value={schoolId} onChange={e=>onChange(e.target.value,college)}>{SCHOOLS.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>学院（可选）<input aria-label="复试参考学院" value={college} maxLength={80} onChange={e=>onChange(schoolId,e.target.value)} placeholder="填学院全称，或查看全校规则"/></label><div className="form-action"><button className="primary" disabled={disabled} onClick={onRun}><Search size={17}/>查找复试参考</button></div></div><p className="muted">查看{year}年规则及前三年的参考材料。点击查找才会联网，已保存结果可直接查看。</p></div>
  {task&&<div className="section-row"><span className="muted">{task.status==='running'?'正在查找，结果会保存在本机':'本次核查：'+time(result?.checkedAt||task.finishedAt||task.startedAt)}</span><button className="text-button" onClick={()=>onInspect(task.id)}><History size={16}/>查看查找记录</button></div>}
  {history.length>1&&<label className="history-select">已保存记录<select aria-label="复试历史记录" value={task?.id} onChange={e=>onInspect(e.target.value)}>{history.map(j=><option key={j.id} value={j.id}>{time(j.startedAt)} · {displayStage(j.status)}</option>)}</select></label>}
  {result?<>
   <div className="reference-columns"><section className="panel"><h2><BookOpen size={20}/>{year}年公开规则</h2><p className="muted">只列出取得原文并通过引用核对的摘录。</p>{result.findings.filter(f=>f.year===year).length?result.findings.filter(f=>f.year===year).map((f,i)=>{const s=sources.find(s=>s.id===f.proof.sourceId);return <article className="finding" key={i}><div className="badges"><strong>{f.topic}</strong><span className="tag supported">原文支持</span></div><blockquote>{f.proof.quote}</blockquote><p className="muted">{f.scope} · {year}年</p><a href={s?.url} target="_blank" rel="noreferrer">{s?.title} · {f.proof.locator}<ExternalLink size={14}/></a></article>;}):<div className="empty compact"><BookOpen size={26}/><h3>当年材料尚待补充</h3><p>本次没有取得可定位的{year}年复试规则，不等于学校尚未发布。</p></div>}</section>
   <section className="panel"><h2><CheckCircle2 size={20}/>下一步核对清单</h2><p className="muted">这些是建议询问的问题，不代表学校存在对应问题。</p>{result.questions.map((q,i)=><label className="check-question" key={i}><input type="checkbox" checked={checked.includes(i)} onChange={()=>setChecked(v=>v.includes(i)?v.filter(n=>n!==i):[...v,i])}/><span>{q}</span></label>)}<label>我的核对记录<textarea aria-label="复试核对记录" value={note} maxLength={2000} onChange={e=>setNote(e.target.value)} placeholder="记录咨询渠道、答复和仍待确认的问题"/></label><button className="primary" onClick={()=>void save()} disabled={saving}><Save size={16}/>保存核对清单</button></section></div>
   <section className="panel"><h2>往年参考材料</h2><p className="muted">历史规则按原招生年度展示，不填入{year}年的资料。</p>{result.findings.filter(f=>f.year!==year).map((f,i)=>{const s=sources.find(s=>s.id===f.proof.sourceId);return <details className="historical-finding" key={i}><summary><span className="tag neutral">{f.year}年</span> {f.topic} · {f.scope}</summary><blockquote>{f.proof.quote}</blockquote><a href={s?.url} target="_blank" rel="noreferrer">{s?.title} · {f.proof.locator}<ExternalLink size={14}/></a></details>;})}{!result.findings.some(f=>f.year!==year)&&<p>本次没有取得可定位的往年规则。</p>}</section>
   <section className="panel"><h2>公开来源与待核对线索</h2><p className="muted">检索结果按链接、标题与摘要去重；同一事件的不同表述仍需人工核对，不按转载数量判断可靠性。未找到相关信息不能用于判断复试公平性。</p><div className="lead-grid">{result.leads.map(leadCard)}</div>{!result.leads.length&&<p>本次没有找到符合学校及年度范围的可用线索。</p>}</section>
   {!!task.issues.length&&<details className="panel"><summary>资料缺口与获取情况（{task.issues.length}）</summary><ul>{task.issues.map((issue,i)=><li key={i}>{issueText(issue)}</li>)}</ul></details>}
  </>:<div className="panel empty"><BookOpen size={32}/><h2>{task?.status==='running'?'正在查找公开材料':'先选学校，查清复试规则'}</h2><p>这里会整理公开规则、往年材料与核对建议，并保留来源。不会对学校作公平性评分。</p>{task&&task.status!=='running'&&<p>{task.issues.map(issueText).join('；')||'该任务没有取得可用结果，可查看查找记录。'}</p>}</div>}
 </section>;
}

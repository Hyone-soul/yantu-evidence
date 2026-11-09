import {FIELDS} from '../shared/types.ts';
import type {Source,Target,Program,FieldKey,Fact} from '../shared/types.ts';
import {school} from '../shared/schools.ts';
import {programId} from './rules.ts';
export function structuredPrograms(source:Source,targets:Target[],year:number,jobId:string){
 const out:Program[]=[];if(source.year!==year||source.error||source.kind!=='formal')return out;
 out.push(...directoryRows(source,targets,year,jobId));
 for(const table of source.tables||[])for(const row of table.rows){
  const cell=(header:string)=>{const at=table.headers.findIndex(h=>h===header);return at>=0?row.cells[at]||'':'';};
  const codeName=cell('专业'),code=codeName.match(/^\d{6}/)?.[0];if(!code||!targets.some(t=>t.schoolId===source.schoolId&&t.code===code))continue;
  const p:Program={id:'',schoolId:source.schoolId,school:school(source.schoolId).name,year,college:cell('院系所')||'未定位',code,name:codeName.slice(6),direction:cell('研究方向')||'未定位',degree:cell('学位类型')||'未定位',mode:cell('学习方式')||'未定位',facts:{},updatedAt:new Date().toISOString(),jobId,origin:'structured'};
  p.id=programId(p);
  for(const key of Object.keys(FIELDS) as FieldKey[])p.facts[key]={key,value:'未取得可定位的当年资料',scope:'当前专业组合',year,state:'missing',proofs:[],checkedAt:p.updatedAt,review:'extracted'};
  const block=source.blocks.find(b=>b.id===row.blockId)!;
  const add=(key:FieldKey,value:string,unit='')=>{if(!value)return;const f:Fact={key,value,unit,scope:p.college+' / '+p.code+' / '+p.mode,year,state:'supported',proofs:[{sourceId:source.id,blockId:block.id,quote:block.text,locator:row.locator}],checkedAt:p.updatedAt,review:'extracted'};p.facts[key]=f;};
  add('college',p.college);add('degree',p.degree);add('mode',p.mode);add('direction',p.direction);add('plan',cell('拟招生人数'),'人（目录拟招生口径）');add('retest',cell('复试专业知识考查范围'));add('equivalent',cell('同等学力复试加试科目'));
  const subjects=cell('考试科目').match(/[①②③④][^①②③④]+/g)||[];
  (['politics','english','math','specialist'] as FieldKey[]).forEach((k,i)=>{if(subjects[i])add(k,subjects[i]);});
  const scope=source.blocks.find(b=>b.text.includes('拟招生人数说明：'));
  if(scope){const line=scope.text.split('\n').find(l=>l.includes('拟招生人数说明：'))!;p.facts.planScope={key:'planScope',value:line,scope:'全校各专业目录拟招生人数',year,state:'supported',proofs:[{sourceId:source.id,blockId:scope.id,quote:line,locator:scope.locator}],checkedAt:p.updatedAt,review:'extracted'};}
  out.push(p);
 }
 return out;
}
// A PDF catalogue with "专业及研究方向" has a different layout from the Excel catalogue.
// Read a single table row and its page heading; never borrow subjects from neighbouring rows.
function directoryRows(source:Source,targets:Target[],year:number,jobId:string){
 const result:Program[]=[];
 for(const table of source.tables||[]){if(!table.headers.includes('专业及研究方向')||!table.headers.includes('初试科目'))continue;
  const page=table.name.match(/第\d+页/)?.[0],context=source.blocks.find(b=>b.locator===page),heading=context?.text.split('\n').find(l=>/^\d{3}\s/.test(l.trim()));
  if(!context||!heading||!/计算机/.test(heading)||/联培|专项|中外|中心|研究院/.test(heading))continue;
  const college=heading.trim().replace(/^\d{3}\s*/,''),cell=(cells:string[],key:string)=>cells[table.headers.indexOf(key)]||'';
  for(const row of table.rows){const identity=cell(row.cells,'专业及研究方向');const target=targets.find(t=>t.schoolId===source.schoolId&&identity.startsWith(t.code)&&identity.includes(t.name));if(!target)continue;
   const modes=identity.includes('非全日制')&&identity.replaceAll('非全日制','').includes('全日制')?['全日制','非全日制']:identity.includes('非全日制')?['非全日制']:identity.includes('全日制')?['全日制']:['未定位'];
   for(const mode of modes){const direction=identity.slice(identity.indexOf(target.name)+target.name.length).replace(/（全日制、非全日制）/g,'').trim()||'未定位';const p:Program={id:'',schoolId:target.schoolId,school:school(target.schoolId).name,year,college,code:target.code,name:target.name,direction,degree:'未定位',mode,facts:{},updatedAt:new Date().toISOString(),jobId,origin:'structured'};
    const block=source.blocks.find(b=>b.id===row.blockId)!;
    for(const key of Object.keys(FIELDS) as FieldKey[])p.facts[key]={key,value:'未取得可定位的当年资料',scope:'当前专业组合',year,state:'missing',proofs:[],checkedAt:p.updatedAt,review:'extracted'};
    const add=(key:FieldKey,value:string,b=block)=>{if(!value||value==='未定位')return;p.facts[key]={key,value,scope:college+' / '+target.code+' / '+mode,year,state:'supported',proofs:[{sourceId:source.id,blockId:b.id,quote:b.text,locator:b.locator}],checkedAt:p.updatedAt,review:'extracted'};};
    add('college',college,context);add('direction',direction);add('mode',mode);add('retest',cell(row.cells,'复试科目'));add('equivalent',cell(row.cells,'同等学力加试科目'));
    const subjects=cell(row.cells,'初试科目').match(/[①②③④][^①②③④]+/g)||[];(['politics','english','math','specialist'] as FieldKey[]).forEach((key,i)=>{if(subjects[i])add(key,subjects[i].trim());});
    p.id=programId(p);result.push(p);
   }
  }
 }
 return result;
}

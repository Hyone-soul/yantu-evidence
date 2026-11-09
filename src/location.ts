export type Page='programs'|'compare'|'retest'|'watch';
export interface LocationState {page:Page;query:string;year:number;region:string;degree:string;mode:string;specialty:string;selected:string[];view:string;program:string;field:string;job:string;reference:string;rschool:string;rcollege:string;watch:string;tab:string;english:string;math:string;specialist:string;includeUnknown:boolean;hprogram:string;}
export function readLocation(search=window.location.search):LocationState{
 const q=new URLSearchParams(search),page=q.get('page')||'programs',year=Number(q.get('year')||2027);
 let selected=q.get('compare')?.split(',').filter(Boolean)||[];
 if(!q.has('compare'))try{const saved=JSON.parse(localStorage.getItem('yantu-compare')||'[]');if(Array.isArray(saved))selected=saved.filter((v:unknown):v is string=>typeof v==='string');}catch{}
 return {page:['programs','compare','retest','watch'].includes(page)?page as Page:'programs',query:q.get('q')||'',year:year>=2024&&year<=2030?year:2027,region:q.get('region')||'',degree:q.get('degree')||'',mode:q.get('mode')||'',specialty:q.get('specialty')||'',selected:[...new Set(selected)].slice(0,3),view:q.get('view')||'',program:q.get('program')||'',field:q.get('field')||'',job:q.get('job')||'',reference:q.get('reference')||'',rschool:q.get('school')||'ccut',rcollege:q.get('college')||'',watch:q.get('watch')||'watched',tab:q.get('tab')||'facts',english:q.get('english')||'',math:q.get('math')||'',specialist:q.get('specialist')||'',includeUnknown:q.get('unknown')==='1',hprogram:q.get('historyProgram')||''};
}
export function locationSearch(s:LocationState){
 const q=new URLSearchParams();q.set('page',s.page);q.set('year',String(s.year));q.set('compare',s.selected.join(','));
 for(const [key,value] of Object.entries({q:s.query,region:s.region,degree:s.degree,mode:s.mode,specialty:s.specialty,view:s.view,program:s.program,field:s.field,job:s.job,reference:s.reference,school:s.rschool,college:s.rcollege,watch:s.watch,tab:s.tab,english:s.english,math:s.math,specialist:s.specialist,unknown:s.includeUnknown?'1':'',historyProgram:s.hprogram}))if(value)q.set(key,value);
 return '?'+q.toString();
}

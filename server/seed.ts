import fs from 'node:fs';
import path from 'node:path';
import {root} from './config.ts';
import {all,put,transaction} from './db.ts';
export function seed(){const recent=path.join(root,'research','public-depth-excerpts.json'),file=fs.existsSync(recent)?recent:path.join(root,'research','public-reviewed-sample.json');if(all('programs').length||!fs.existsSync(file))return;const data=JSON.parse(fs.readFileSync(file,'utf8'));transaction(()=>{for(const p of data.programs)put('programs',p);for(const s of data.sources)put('sources',s);for(const r of data.reviews)put('reviews',r);for(const h of data.history||[])put('admission_history',h);for(const i of data.insights||[])put('program_insights',i);});}

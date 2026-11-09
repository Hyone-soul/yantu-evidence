import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import {config} from './config.ts';
import type {Program,Source,Job,Review,Comparison} from '../shared/types.ts';
fs.mkdirSync(path.dirname(config.db),{recursive:true});
const db=new DatabaseSync(config.db);
db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
const tables=['programs','sources','jobs','reviews','comparisons','versions','selections','settings','admission_history','program_insights'] as const;
type Table=typeof tables[number];
for(const t of tables)db.exec(`CREATE TABLE IF NOT EXISTS ${t}(id TEXT PRIMARY KEY,body TEXT NOT NULL)`);
if(process.env.APP_OFFLINE===undefined){const row=db.prepare('SELECT body FROM settings WHERE id=?').get('runtime') as {body:string}|undefined;if(row)config.offline=!!JSON.parse(row.body).offline;}
export function get<T>(t:Table,id:string):T|undefined {const r=db.prepare(`SELECT body FROM ${t} WHERE id=?`).get(id) as {body:string}|undefined;return r?JSON.parse(r.body):undefined;}
export function all<T>(t:Table):T[]{return(db.prepare(`SELECT body FROM ${t} ORDER BY rowid DESC`).all() as {body:string}[]).map(r=>JSON.parse(r.body));}
export function put<T extends {id:string}>(t:Table,item:T){db.prepare(`INSERT INTO ${t} VALUES(?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body`).run(item.id,JSON.stringify(item));}
export function remove(t:Table,id:string){db.prepare(`DELETE FROM ${t} WHERE id=?`).run(id);}
export function transaction(fn:()=>void){db.exec('BEGIN IMMEDIATE');try{fn();db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}}
export function processAlive(pid?:number){if(!pid)return false;try{process.kill(pid,0);return true;}catch{return false;}}
export function interrupt(){for(const job of all<Job>('jobs'))if(job.status==='running'&&!processAlive(job.ownerPid)){job.status='interrupted';job.stage='任务中断';job.finishedAt=new Date().toISOString();job.issues.push('任务执行进程已退出，已有结果已保留；请手动重新核查。');put('jobs',job);}}
export const programs=()=>all<Program>('programs').filter(p=>!p.supersededBy);
export const sources=()=>all<Source>('sources');
export const jobs=()=>all<Job>('jobs');
export const reviews=()=>all<Review>('reviews');
export const comparisons=()=>all<Comparison>('comparisons');

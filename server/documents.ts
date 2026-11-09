import {createHash} from 'node:crypto';
import {isIP,BlockList} from 'node:net';
import dns from 'node:dns/promises';
import fs from 'node:fs';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fetch,request,ProxyAgent,Agent} from 'undici';
import {config,root} from './config.ts';
import {ownedHost,school} from '../shared/schools.ts';
import type {Job,Source,DiscoveryPath} from '../shared/types.ts';
import {put,sources,get} from './db.ts';
const run=promisify(execFile);
export function discardBody(body:{on:(event:string,handler:()=>void)=>unknown;destroy:()=>unknown}){body.on('error',()=>{});body.destroy();}

const blocked=new BlockList();
for(const [ip,bits] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.168.0.0',16],['192.0.0.0',24],['192.0.2.0',24],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',3]] as const)blocked.addSubnet(ip,bits,'ipv4');
for(const [ip,bits] of [['::',128],['::1',128],['fc00::',7],['fe80::',10],['ff00::',8],['2001:db8::',32]] as const)blocked.addSubnet(ip,bits,'ipv6');
export function publicIp(ip:string){const family=isIP(ip);return !!family&&!blocked.check(ip,family===4?'ipv4':'ipv6')&&!ip.toLowerCase().startsWith('::ffff:');}
export function validateUrl(raw:string,schoolId:string){const u=new URL(raw);if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.port&&!['80','443'].includes(u.port)||!ownedHost(u.hostname,schoolId)||isIP(u.hostname))throw new Error('仅允许目标院校或研招网的公开HTTP(S)资料。');u.hash='';u.pathname=u.pathname.replace(/\/{2,}/g,'/');return u;}
const publicAccountHosts=['blog.csdn.net','www.cnblogs.com','zhuanlan.zhihu.com','www.zhihu.com','noobdream.com','www.noobdream.com','xinxi.ycit.edu.cn'];
export function validateAccountUrl(raw:string){const u=new URL(raw);if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.port&&!['80','443'].includes(u.port)||!publicAccountHosts.includes(u.hostname)||isIP(u.hostname))throw new Error('该公开经验来源尚未登记，仅保留外部入口');u.hash='';return u;}
const dnsDispatcher=config.proxy?new ProxyAgent(config.proxy):undefined;
const resolutions=new Map<string,{ip:string,until:number}>();
async function resolvePublic(host:string,signal:AbortSignal){
 const cache=resolutions.get(host);if(cache&&cache.until>Date.now())return cache.ip;
 let addresses=(await dns.lookup(host,{all:true})).map(a=>a.address);
 // Clash fake-IP is not a real destination. Resolve through a fixed TLS-verified DoH service,
 // then pin the public address in the actual CONNECT request to prevent DNS rebinding.
 if(!addresses.some(publicIp)&&config.proxy){const r=await fetch('https://1.1.1.1/dns-query?name='+encodeURIComponent(host)+'&type=A',{dispatcher:dnsDispatcher,signal,redirect:'error',headers:{accept:'application/dns-json'}});if(!r.ok)throw new Error('公共DNS查询失败');const d=await r.json() as {Answer?:{type:number;data:string}[]};addresses=(d.Answer||[]).filter(a=>a.type===1).map(a=>a.data);}
 const ip=addresses.find(publicIp);if(!ip)throw new Error('目标解析为非公网地址，已阻止访问。');resolutions.set(host,{ip,until:Date.now()+60000});return ip;
}
export function classify(title:string,text:string):Source['kind']{if(/预公告|预告版|拟对|拟调整/.test(title+' '+text.slice(0,1200)))return 'preliminary';if(/调整|更正|修订/.test(title))return 'notice';if(/招生专业目录|招生章程|招生简章|考试大纲|参考书目|招生学院及专业方向介绍/.test(title))return 'formal';return 'unknown';}
export async function acquire(rawUrl:string,schoolId:string,job:Job,refresh=false,origin?:DiscoveryPath,publicAccount=false):Promise<Source>{
 if(config.offline)throw new Error('离线模式禁止外部获取');
 const checked=(url:string)=>publicAccount?validateAccountUrl(url):validateUrl(url,schoolId);
 const initial=checked(rawUrl).href;
 const cached=sources().find(s=>s.url===initial&&s.schoolId===schoolId&&!s.error);
 if(!refresh&&cached&&!cached.sample&&cached.parserVersion===7&&Date.now()-Date.parse(cached.fetchedAt)<24*3600000){job.cacheHits++;if(origin){cached.discovery=[...(cached.discovery||[]),origin];put('sources',cached);}if(!job.sourceIds.includes(cached.id))job.sourceIds.push(cached.id);return cached;}
 if(job.downloads>=12)throw new Error('已达到12份文档上限');if(job.bytes>=40*1024**2)throw new Error('已达到40MiB累计处理上限');job.downloads++;
 const signal=AbortSignal.timeout(20000);let current=initial;let buffer:Buffer|undefined;let mime='';
 for(let redirect=0;redirect<=4;redirect++){
   const u=checked(current);const ip=await resolvePublic(u.hostname,signal);
   const dispatcher=config.proxy?new ProxyAgent({uri:config.proxy,requestTls:{servername:u.hostname}}):new Agent({connect:{servername:u.hostname}});
   const pinned=new URL(u);pinned.hostname=ip.includes(':')?'['+ip+']':ip;
   try{
   const r=await request(pinned,{dispatcher,signal,headers:{host:u.host,'user-agent':'YantuEvidence (local document reader)'}});
    if([301,302,303,307,308].includes(r.statusCode)){const location=r.headers['location'];discardBody(r.body);if(!location||redirect===4)throw new Error('重定向次数超过限制');current=checked(new URL(String(location),current).href).href;continue;}
    if(r.statusCode<200||r.statusCode>=300){discardBody(r.body);throw new Error('原文获取 HTTP '+r.statusCode);}
    const declared=Number(r.headers['content-length']||0);if(declared>8*1024**2){discardBody(r.body);throw new Error('单份文档超过8MiB');}
    mime=String(r.headers['content-type']||'');const chunks:Buffer[]=[];let size=0;
    for await(const chunk of r.body!){const b=Buffer.from(chunk);size+=b.length;job.bytes+=b.length;if(size>8*1024**2||job.bytes>40*1024**2){discardBody(r.body);throw new Error('文档下载超出大小限制');}chunks.push(b);}
    buffer=Buffer.concat(chunks);break;
   }finally{await dispatcher.close();}
 }
 if(!buffer)throw new Error('没有取得文档正文');
 const hash=createHash('sha256').update(buffer).digest('hex');const id='src-'+createHash('sha256').update(initial+hash+'|parser7').digest('hex').slice(0,20);
 const dir=path.join(root,'data','documents');fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,hash+'.bin');fs.writeFileSync(file,buffer);
 const {stdout}=await run(config.python,[path.join(root,'scripts','extract.py'),file,current,String(12-job.downloads+1),String(40*1024**2-job.bytes+buffer.length)],{encoding:'utf8',env:{...process.env,PYTHONIOENCODING:'utf-8'},timeout:20000,maxBuffer:16*1024**2});
 const parsed=JSON.parse(stdout);const text=parsed.blocks.map((b:{text:string})=>b.text).join('\n');
 job.downloads+=Math.max(0,Number(parsed.members||0)-1);job.bytes+=Math.max(0,Number(parsed.expandedBytes||0)-buffer.length);
 const title=parsed.title||new URL(current).pathname;const year=Number(title.match(/20\d{2}/)?.[0])||null;
 const source:Source={id,schoolId,url:initial,finalUrl:current,title,kind:classify(title,text),year,publishedAt:(text.match(/20\d{2}[-年/.]\d{1,2}[-月/.]\d{1,2}/)?.[0]||null),fetchedAt:new Date().toISOString(),hash,mime,bytes:buffer.length,...parsed};
 source.title=title;
 source.role=publicAccount?'public_account':'admissions';
 source.discovery=origin?[origin]:[];
 if(origin?.parentSourceId&&!source.year){const parent=get<Source>('sources',origin.parentSourceId);if(parent?.year&&parent.links.some(l=>l.url===initial)){source.year=parent.year;const b=parent.blocks.find(b=>b.text.includes(String(parent.year)));if(b)source.yearBasis={sourceId:parent.id,blockId:b.id,quote:b.text.slice(0,800),locator:b.locator};source.title=parent.title+' · '+(parent.links.find(l=>l.url===initial)?.title||'附件');}}
 source.kind=classify(source.title,text);
 if(/^(提示信息|403 Forbidden|404 Not Found)$/.test(source.title))source.error='原文入口返回提示或错误页面，未取得目标正文。';
 if(!source.blocks.length&&!source.error)source.error='页面未提供可定位正文，可能需要动态加载或人工核对。';
 if(new URL(current).hostname==='yz.chsi.com.cn'&&!(title+' '+text).includes(school(schoolId).name))source.error='研招网页面未定位目标学校归属，不能作为本校字段依据。';
 put('sources',source);if(!job.sourceIds.includes(id))job.sourceIds.push(id);return source;
}

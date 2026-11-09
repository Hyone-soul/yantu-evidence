import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {root,config} from '../server/config.ts';
function parse(text:string){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yantu-parser-'));const file=path.join(dir,'input.html');fs.writeFileSync(file,text);try{return JSON.parse(execFileSync(config.python,[path.join(root,'scripts','extract.py'),file,'https://yzb.btbu.edu.cn/a'],{encoding:'utf8',env:{...process.env,PYTHONIOENCODING:'utf-8'}}));}finally{fs.rmSync(dir,{recursive:true,force:true});}}
test('官网用form包裹的正文必须保留',()=>{const r=parse('<title>2027招生章程</title><form><div id="vsb_content">081200计算机科学与技术</div></form>');assert.match(r.blocks[0].text,/081200/);});
test('脚本里的伪指令不进入原文块且不执行',()=>{const r=parse('<article>招生原文</article><script>throw new Error("转移密钥")</script>');assert.equal(r.blocks[0].text,'招生原文');});
test('验证码附件明确标记获取失败',()=>{const r=parse('<title>附件下载</title><p>请输入验证码下载附件</p>');assert.match(r.error,/验证码/);});
test('PDF iframe附件可被发现',()=>{const r=parse('<p>2027目录</p><iframe src="/viewer?file=%2Ffile.pdf"></iframe>');assert.equal(r.links[0].url,'https://yzb.btbu.edu.cn/file.pdf');});

test('历史表合并单元格展开后保留学院与学习形式，空白不补零',()=>{const r=parse('<article><table><tr><th>学院名称</th><th>专业代码</th><th>学习形式</th><th>报名人数</th></tr><tr><td rowspan="2">计算机学院</td><td rowspan="2">085404</td><td>全日制</td><td>100</td></tr><tr><td>非全日制</td><td></td></tr></table></article>');assert.equal(r.tables[0].rows[1].cells[0],'计算机学院');assert.equal(r.tables[0].rows[1].cells[2],'非全日制');assert.equal(r.tables[0].rows[1].cells[3],'');assert.match(r.tables[0].rows[1].locator,/第3行/);});
test('学院网页泛标题被正文招生标题补足，发表日期另存',()=>{const r=parse('<title>计算机学院</title><article><h2>2026年硕士研究生复试工作细则</h2><p>发布时间：2026-03-20</p><p>各专业复试要求。</p></article>');assert.equal(r.title,'2026年硕士研究生复试工作细则');assert.equal(r.publishedAt,'2026-03-20');});

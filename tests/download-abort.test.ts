import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {request,Agent} from 'undici';
import {discardBody} from '../server/documents.ts';
test('丢弃被拒绝的下载响应不会触发未处理流错误或退出进程',async()=>{
 const server=http.createServer((_req,res)=>{res.writeHead(403,{'Content-Type':'text/plain'});res.write('not allowed');const timer=setInterval(()=>res.write('body'),10);res.on('close',()=>clearInterval(timer));});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const port=(server.address() as import('node:net').AddressInfo).port,agent=new Agent();
 try{const response=await request('http://127.0.0.1:'+port,{dispatcher:agent});assert.equal(response.statusCode,403);discardBody(response.body);await new Promise(r=>setTimeout(r,30));assert.ok(response.body.destroyed);}finally{await agent.close();await new Promise<void>(r=>server.close(()=>r()));}
});

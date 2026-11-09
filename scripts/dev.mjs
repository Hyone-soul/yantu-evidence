import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const cwd=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const children=[spawn(process.execPath,['--watch','--import','tsx','server/index.ts'],{cwd,stdio:'inherit',env:{...process.env,NODE_ENV:'development'}}),spawn(process.execPath,['node_modules/vite/bin/vite.js'],{cwd,stdio:'inherit'})];
function stop(){for(const c of children)c.kill();}process.on('SIGINT',()=>{stop();process.exit();});process.on('SIGTERM',()=>{stop();process.exit();});for(const c of children)c.on('exit',code=>{stop();process.exit(code||0);});

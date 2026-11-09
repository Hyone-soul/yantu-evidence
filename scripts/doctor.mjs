import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
console.log('Node:',process.version,'| 工程:',root);
if(Number(process.versions.node.split('.')[0])<24)process.exitCode=1;
const result=spawnSync(process.env.PYTHON_BIN||'python',['-c','import sys,fitz,pdfplumber,openpyxl,bs4,xlrd; print("Python:",sys.version.split()[0],"| PDF/Excel/HTML dependencies ready")'],{encoding:'utf8',env:{...process.env,PYTHONIOENCODING:'utf-8'}});console.log(result.stdout||result.stderr);if(result.status)process.exitCode=1;
console.log('凭据仅由服务端读取；检测不会输出密钥或调用付费API。');

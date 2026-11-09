import { createHash, createHmac } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fetch, ProxyAgent } from 'undici';
import { config, redact, root } from './config.ts';

const dispatcher = config.proxy ? new ProxyAgent(config.proxy) : undefined;
export class ApiError extends Error {
  constructor(message: string, public code = 'API_ERROR') { super(message); }
}
type Json = Record<string, any>;
export async function post(url: string, headers: Record<string, string>, payload: object, timeout: number, transport:typeof fetch=fetch): Promise<Json> {
  if (config.offline) throw new ApiError('当前处于离线模式，已保存资料仍可查看与导出。', 'OFFLINE');
  try {
    const response = await transport(url, { method: 'POST', headers, body: JSON.stringify(payload), dispatcher, signal: AbortSignal.timeout(timeout), redirect: 'error' });
    const text = await response.text();
    let data: Json;
    try { data = JSON.parse(text); } catch { throw new ApiError('接口返回了无法解析的内容。', 'INVALID_RESPONSE'); }
    if (!response.ok) {
      const code = data.error?.code || `HTTP_${response.status}`;
      throw new ApiError(`接口请求未成功（${code}）：${redact(data.error?.message || '请检查服务状态与配置。').slice(0, 220)}`, String(code));
    }
    return data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const e = error as Error & { cause?: { code?: string } };
    throw new ApiError(e.name === 'TimeoutError' ? '接口响应超时，请稍后再试。' : `网络连接未完成${e.cause?.code ? `（${e.cause.code}）` : ''}，请检查本地代理。`, 'NETWORK');
  }
}
export function saveRaw(runId: string, name: string, data: unknown) {
  const dir = path.join(root, 'data', 'raw', runId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name + '.json'), redact(data), 'utf8');
}
export function decodeSearch(raw: Json) {
  const data = raw.Response;
  if (!data) throw new ApiError('搜索响应缺少 Response 字段。', 'INVALID_RESPONSE');
  if (data.Error) throw new ApiError(`元宝搜索：${redact(data.Error.Message)}`, data.Error.Code);
  const pages: Json[] = [];
  for (const item of data.Pages || []) {
    try { const page = typeof item === 'string' ? JSON.parse(item) : item; if (page && typeof page === 'object' && !Array.isArray(page)) pages.push(page); } catch { /* Keep valid pages; raw response is retained. */ }
  }
  return { pages, requestId: String(data.RequestId || ''), version: data.Version };
}
export function decodeModel(raw: Json): Json {
  const content = raw.choices?.[0]?.message?.content;
  if (!content) throw new ApiError('模型返回了空内容。', 'EMPTY_MODEL_OUTPUT');
  try {
    const json = JSON.parse(content);
    if (!json || typeof json !== 'object' || Array.isArray(json)) throw new Error('Expected object');
    return json;
  } catch { throw new ApiError('模型未返回完整 JSON 对象。', 'INVALID_MODEL_JSON'); }
}
export async function yuanbao(query: string, site?: string, onRaw?: (raw:Json)=>void) {
  if (!config.secretId || !config.secretKey) throw new ApiError('尚未配置元宝搜索凭据。', 'MISSING_CONFIG');
  const host = 'wsa.tencentcloudapi.com';
  const payload = { Query: query, ...(site ? { Site: site } : {}) };
  const contentType = 'application/json; charset=utf-8';
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const hash = (s: string) => createHash('sha256').update(s).digest('hex');
  const hmac = (key: string | Buffer, text: string) => createHmac('sha256', key).update(text).digest();
  const signed = 'content-type;host;x-tc-action';
  const canonical = `POST\n/\n\ncontent-type:${contentType}\nhost:${host}\nx-tc-action:searchpro\n\n${signed}\n${hash(JSON.stringify(payload))}`;
  const scope = `${date}/wsa/tc3_request`;
  const signingKey = hmac(hmac(hmac('TC3' + config.secretKey, date), 'wsa'), 'tc3_request');
  const signature = createHmac('sha256', signingKey).update(`TC3-HMAC-SHA256\n${timestamp}\n${scope}\n${hash(canonical)}`).digest('hex');
  const raw = await post(`https://${host}/`, {
    'Content-Type': contentType, 'X-TC-Action': 'SearchPro', 'X-TC-Version': '2025-05-08', 'X-TC-Timestamp': String(timestamp),
    Authorization: `TC3-HMAC-SHA256 Credential=${config.secretId}/${scope}, SignedHeaders=${signed}, Signature=${signature}`,
  }, payload, 30000);
  onRaw?.(raw);
  return { ...decodeSearch(raw), raw };
}
export async function modelJson(system: string, prompt: string, maxTokens = 3200, onRaw?: (raw:Json)=>void) {
  if (!config.base || !config.key) throw new ApiError('尚未配置文字模型接口。', 'MISSING_CONFIG');
  const raw = await post(config.base + '/chat/completions', { 'Content-Type': 'application/json', Authorization: 'Bearer ' + config.key }, {
    model: config.model, messages: [{ role: 'system', content: system + '\n必须输出有效json对象。' }, { role: 'user', content: prompt }],
    response_format: { type: 'json_object' }, enable_thinking: false, stream: false, temperature: 0.35, max_tokens: maxTokens,
  }, 60000);
  onRaw?.(raw);
  return { json: decodeModel(raw), usage: raw.usage || {}, raw };
}

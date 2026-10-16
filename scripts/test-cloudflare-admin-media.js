const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Writable } = require('node:stream');
const native = require('../lib/cloudflare-admin-media');
const legacy = require('../api/admin');
const { createSession } = require('../lib/case-auth');

async function main() {
  const previous = process.env.CASE_SESSION_SECRET;
  const priorEnv = globalThis.__YZH_CF_ENV;
  process.env.CASE_SESSION_SECRET = crypto.randomBytes(32).toString('hex');
  const bytes = new Uint8Array(1121641).fill(71);
  let record, missingObject = false, malformed = false, storedBody;
  const bucket = { async get(key) {
    if (key.endsWith('.json')) return record ? { json: async () => { if (malformed) throw new SyntaxError('test'); return record; }, body: new Blob([JSON.stringify(record)]).stream() } : null;
    if (missingObject) return null;
    storedBody = new ReadableStream({ start(c) { c.enqueue(bytes); c.close(); } });
    return { body: storedBody, size: bytes.length };
  } };
  const env = { MEDIA_BUCKET: bucket };
  globalThis.__YZH_CF_ENV = env;
  const originalBackend = process.env.STORAGE_BACKEND;
  process.env.STORAGE_BACKEND = 'r2';
  const url = 'https://qa.invalid/api/admin?module=media-image&id=MEDIA-TEST';
  const initial = () => ({ id:'MEDIA-TEST', pathname:'qa/image', contentType:'image/png', size:bytes.length });
  let count = 0;
  async function compare(label, changes = {}, options = {}, status = 200) {
    record = { ...initial(), ...changes };
    const request = new Request(url + (options.poster ? '&variant=poster' : ''), { method:options.method || 'GET', headers:options.headers || {} });
    const actual = await native(request, env);
    assert.equal(actual.status, status, label);
    if (status === 200) assert.equal(actual.body, storedBody, 'Return R2 body without copying');
    const headers = new Map(), chunks = [];
    const res = new Writable({write(chunk, encoding, callback) {chunks.push(Buffer.from(chunk)); callback();}});
    res.setHeader = (k,v) => headers.set(k.toLowerCase(), String(v));
    res.statusCode = 200;
    const finished = new Promise(resolve => res.on('finish',resolve));
    const parsed = new URL(request.url);
    await legacy({ method:request.method, query:Object.fromEntries(parsed.searchParams), headers:Object.fromEntries(request.headers) },res);
    await finished;
    assert.equal(actual.status, res.statusCode, label+' legacy status parity');
    for (const key of ['content-type','content-length','cache-control','content-disposition','content-security-policy']) assert.equal(actual.headers.get(key), headers.get(key) || (key==='content-type' && status!==200 ? 'text/plain;charset=UTF-8' : null), label+' '+key);
    assert.deepEqual(Buffer.from(await actual.arrayBuffer()), Buffer.concat(chunks), label+' bytes');
    count++;
  }
  try {
    await compare('image');
    await compare('svg', {contentType:'image/svg+xml'});
    await compare('ready video', {contentType:'video/quicktime',playbackPathname:'qa/playback',playbackContentType:'video/mp4',playbackSize:bytes.length});
    await compare('poster', {contentType:'video/mp4',posterPathname:'qa/poster',posterSize:bytes.length}, {poster:true});
    await compare('missing poster',{}, {poster:true},404);
    await compare('pending anonymous',{contentType:'video/mp4',processingStatus:'processing'}, {},425);
    await compare('trash anonymous',{trashedAt:'2026-01-01'}, {},404);
    const headers = {Cookie:`yzh_case_admin=${createSession()}`};
    await compare('trash admin',{trashedAt:'2026-01-01'}, {headers});
    await compare('pending admin',{contentType:'video/quicktime',processingStatus:'processing',originalPathname:'qa/original'}, {headers});
    await compare('method',{}, {method:'POST'},405);
    missingObject = true;await compare('missing R2',{}, {},404);missingObject = false;
    record = null;assert.equal((await native(new Request(url),env)).status,404);count++;
    assert.equal((await native(new Request(url.replace('MEDIA-TEST','../bad')),env)).status,404);count++;
    malformed = true;record = initial();assert.equal((await native(new Request(url),env)).status,500);count++;
    console.log(`PASS ${count} native-stream, legacy parity, session, SVG, video, poster, missing and error checks`);
  } finally {
    globalThis.__YZH_CF_ENV = priorEnv;
    if (previous===undefined) delete process.env.CASE_SESSION_SECRET; else process.env.CASE_SESSION_SECRET=previous;
    if (originalBackend===undefined) delete process.env.STORAGE_BACKEND; else process.env.STORAGE_BACKEND=originalBackend;
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});

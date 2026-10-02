import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyLinkedInJob } from '../shared/jev.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

async function loadEnv() {
  const envPath = join(root, '.env');
  if (!existsSync(envPath)) return;
  for (const line of (await readFile(envPath, 'utf8')).split(/\r?\n/)) {
    const entry = line.trim();
    const equal = entry.indexOf('=');
    if (!entry || entry.startsWith('#') || equal < 0) continue;
    const key = entry.slice(0, equal).trim();
    let value = entry.slice(equal + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function requestJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 2_000_000) throw new Error('Request body too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function statusFor(message) {
  if (/Missing OPENCODE_API_KEY/i.test(message)) return 500;
  if (/401|403/.test(message)) return 401;
  if (/429/.test(message)) return 429;
  if (/503|529|temporarily unavailable|overloaded/i.test(message)) return 503;
  return 502;
}

async function staticFile(res, requestPath) {
  const relative = normalize(requestPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = join(root, relative);
  if (!filePath.startsWith(root) || !existsSync(filePath)) return json(res, 404, { error: 'Not found' });
  const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' }[extname(filePath)] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` });
  res.end(await readFile(filePath));
}

await loadEnv();
const port = Number(process.env.PORT || 8787);
createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.writeHead(204).end();

  const url = new URL(req.url, `http://localhost:${port}`);
  if (url.pathname === '/api/health' && req.method === 'GET') {
    return json(res, 200, { ok: true, model: process.env.OPENCODE_MODEL || 'jev-1.13-free', hasKey: Boolean(process.env.OPENCODE_API_KEY) });
  }
  if (url.pathname === '/api/verify-job' && req.method === 'POST') {
    try {
      return json(res, 200, await verifyLinkedInJob(await requestJson(req)));
    } catch (error) {
      const message = String(error?.message || error);
      console.error('[verify-job]', message);
      return json(res, statusFor(message), { error: message });
    }
  }
  if (req.method === 'GET') return staticFile(res, url.pathname === '/' ? 'extension/manifest.json' : url.pathname.slice(1));
  return json(res, 404, { error: 'Not found' });
}).listen(port, () => {
  console.log(`JEV Verify server → http://localhost:${port}`);
  console.log('  POST /api/verify-job  (LinkedIn job risk assessment)');
  console.log('  GET  /api/health');
});

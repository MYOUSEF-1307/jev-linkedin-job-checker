import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyLinkedInJob } from '../shared/jev.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
if (existsSync(join(root, '.env'))) {
  for (const line of (await readFile(join(root, '.env'), 'utf8')).split(/\r?\n/)) {
    const entry = line.trim(); const equal = entry.indexOf('=');
    if (!entry || entry.startsWith('#') || equal < 0) continue;
    const key = entry.slice(0, equal).trim();
    if (!(key in process.env)) process.env[key] = entry.slice(equal + 1).trim().replace(/^['"]|['"]$/g, '');
  }
}
try {
  const data = await verifyLinkedInJob({ url: 'https://www.linkedin.com/jobs/view/example', title: 'Software Engineer', company: 'Example Technologies', location: 'Cairo, Egypt', description: 'Build and maintain web applications with JavaScript. Apply through the official LinkedIn application flow.' });
  if (!data?.verification?.status) throw new Error('Response did not contain a verification status.');
  console.log(`SMOKE TEST PASSED: ${data.model} → ${data.verification.status}`);
} catch (error) { console.error(`SMOKE TEST FAILED: ${error.message}`); process.exit(1); }

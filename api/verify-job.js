import { verifyLinkedInJob } from '../shared/jev.mjs';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    res.status(200).json(await verifyLinkedInJob(body));
  } catch (error) {
    const message = String(error?.message || error);
    const status = /Missing OPENCODE_API_KEY/.test(message) ? 500 : /401|403/.test(message) ? 401 : /429/.test(message) ? 429 : 502;
    res.status(status).json({ error: message });
  }
}

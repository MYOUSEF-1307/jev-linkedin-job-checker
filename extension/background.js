const DEFAULTS = { apiBaseUrl: 'http://localhost:8787', enabled: true };

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get(Object.keys(DEFAULTS));
  const missing = Object.fromEntries(Object.entries(DEFAULTS).filter(([key]) => current[key] === undefined));
  if (Object.keys(missing).length) await chrome.storage.local.set(missing);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'JEV_VERIFY_JOB') {
    verifyJob(message.payload).then((data) => sendResponse({ ok: true, data })).catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  }
  if (message?.type === 'JEV_GET_CONFIG') { chrome.storage.local.get(Object.keys(DEFAULTS)).then(sendResponse); return true; }
  if (message?.type === 'JEV_GET_JOB_CACHE') { chrome.storage.session.get(message.key).then(sendResponse); return true; }
  if (message?.type === 'JEV_SET_JOB_CACHE') { chrome.storage.session.set({ [message.key]: message.value }).then(() => sendResponse({ ok: true })); return true; }
  return false;
});

async function verifyJob(payload) {
  const { apiBaseUrl } = await chrome.storage.local.get('apiBaseUrl');
  const base = (apiBaseUrl || DEFAULTS.apiBaseUrl).replace(/\/+$/, '');
  let response;
  try { response = await fetch(`${base}/api/verify-job`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); }
  catch (error) { throw new Error(`Cannot reach proxy at ${base} — run "node server/dev-server.mjs" in the ExJev folder (${error?.message || error})`); }
  const body = await response.text();
  let data;
  try { data = JSON.parse(body); } catch { throw new Error(`Bad response from ${base} (HTTP ${response.status}): ${body.slice(0, 200)}`); }
  if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
  return data;
}

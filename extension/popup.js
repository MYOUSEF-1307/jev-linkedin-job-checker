const enabled = document.querySelector('#enabled');
const apiBaseUrl = document.querySelector('#apiBaseUrl');
const status = document.querySelector('#status');
const result = document.querySelector('#result');
const verify = document.querySelector('#verify');
const base = () => apiBaseUrl.value.trim().replace(/\/+$/, '') || 'http://localhost:8787';
const label = (value) => ({ likely_legitimate: 'Likely legitimate', needs_caution: 'Needs caution', suspicious: 'Likely suspicious', insufficient_information: 'Insufficient information', unrelated: 'Not a job listing' }[value] || value);

async function load() { const data = await chrome.storage.local.get(['enabled', 'apiBaseUrl']); enabled.checked = data.enabled !== false; apiBaseUrl.value = data.apiBaseUrl || 'http://localhost:8787'; }
function show(message, kind = '') { status.textContent = message; status.className = `status ${kind}`; }
function render(data) {
  const v = data.verification;
  result.hidden = false;
  result.innerHTML = `<span class="eyebrow">ASSESSMENT</span><h2 class="${v.status}">${label(v.status)}</h2><p class="metrics">Risk ${v.risk}/100 · Confidence ${Math.round(v.confidence * 100)}%</p><ul>${(v.signals || ['No material warning signals found.']).map((item) => `<li>${item}</li>`).join('')}</ul>`;
}

document.querySelector('#save').addEventListener('click', async () => { await chrome.storage.local.set({ enabled: enabled.checked, apiBaseUrl: base() }); show('Settings saved.', 'ok'); });
document.querySelector('#test').addEventListener('click', async () => { show('Testing…'); try { const response = await fetch(`${base()}/api/health`); const data = await response.json(); if (!data.ok) throw new Error(data.error || 'Health check failed'); show(`Connected to ${data.model}.`, 'ok'); } catch (error) { show(`Failed: ${error.message}`, 'err'); } });
verify.addEventListener('click', async () => {
  verify.disabled = true; result.hidden = true; show('Reading the job listing and checking with JEV…');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https:\/\/(www\.)?linkedin\.com\/jobs\//i.test(tab.url || '')) throw new Error('Open an individual LinkedIn job listing first.');
    let response;
    try {
      response = await chrome.tabs.sendMessage(tab.id, { type: 'JEV_ANALYZE_LINKEDIN_JOB' });
    } catch (error) {
      if (!/Receiving end does not exist/i.test(error.message)) throw error;
      await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['content.css'] });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      response = await chrome.tabs.sendMessage(tab.id, { type: 'JEV_ANALYZE_LINKEDIN_JOB' });
    }
    if (!response?.ok) throw new Error(response?.error || 'Verification failed.');
    render({ verification: response.verification }); show('Analysis complete.', 'ok');
  } catch (error) { show(error.message, 'err'); } finally { verify.disabled = false; }
});
load();

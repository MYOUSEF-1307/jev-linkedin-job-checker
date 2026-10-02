(() => {
  if (globalThis.__jevVerifyLinkedInLoaded) return;
  globalThis.__jevVerifyLinkedInLoaded = true;
  const cacheKey = `jev-linkedin-job:${location.href}`;
  const clean = (value, limit = 12000) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
  const text = (...selectors) => {
    for (const selector of selectors) { const value = document.querySelector(selector)?.textContent; if (clean(value)) return clean(value); }
    return '';
  };
  const largestText = (...selectors) => selectors
    .flatMap((selector) => [...document.querySelectorAll(selector)])
    .map((element) => clean(element.innerText || element.textContent))
    .sort((a, b) => b.length - a.length)[0] || '';
  const meta = (name) => document.querySelector(`meta[property="${name}"], meta[name="${name}"]`)?.content || '';
  const escapeHtml = (value) => String(value).replace(/[&<>"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[character]);
  const label = (status) => ({ likely_legitimate: 'Likely legitimate', needs_caution: 'Needs caution', suspicious: 'Likely suspicious', insufficient_information: 'Insufficient information', unrelated: 'Not a job listing' }[status] || status);

  function extractJob() {
    const details = text('.job-details-jobs-unified-top-card__primary-description-container', '.jobs-unified-top-card__primary-description', '[class*="job-details"] [class*="primary-description"]');
    const apply = [...document.querySelectorAll('a[href]')].find((link) => /apply|externalApply|jobs\.linkedin\.com/i.test(`${link.href} ${link.textContent}`));
    return {
      url: location.href,
      title: text('.job-details-jobs-unified-top-card__job-title', '.jobs-unified-top-card__job-title', '[class*="job-title"]', 'main h1', 'h1') || clean(meta('og:title').replace(/\s*\|\s*LinkedIn.*$/i, '')),
      company: text('.job-details-jobs-unified-top-card__company-name', '.jobs-unified-top-card__company-name', '[class*="company-name"]', '[class*="company"] a'),
      location: text('.job-details-jobs-unified-top-card__primary-description-container', '.jobs-unified-top-card__bullet', '[class*="job-details"] [class*="primary-description"]'),
      description: text('.jobs-description__content', '.jobs-description-content__text', '.jobs-box__html-content', '[class*="jobs-description"]', '#job-details') || largestText('main [class*="description"]', 'main article') || clean(document.querySelector('main')?.innerText),
      postedDate: details, applicantCount: details, employmentType: details, workplaceType: details,
      externalApplyUrl: apply?.href || '',
    };
  }

  function render(verification) {
    document.querySelector('#jev-verify-panel')?.remove();
    const panel = document.createElement('aside');
    panel.id = 'jev-verify-panel';
    panel.className = `jev-panel jev-${verification.status}`;
    const signals = verification.signals?.length ? verification.signals.map((signal) => `<li>${escapeHtml(signal)}</li>`).join('') : '<li>No material warning signals found in the supplied listing.</li>';
    panel.innerHTML = `<div class="jev-panel__title">JEV VERIFY <button aria-label="Close">×</button></div><strong>${escapeHtml(label(verification.status))}</strong><span class="jev-risk">Risk score: ${verification.risk}/100 · confidence: ${Math.round(verification.confidence * 100)}%</span><ul>${signals}</ul><p>${escapeHtml(verification.disclaimer)}</p>`;
    panel.querySelector('button').addEventListener('click', () => panel.remove());
    document.body.appendChild(panel);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'JEV_ANALYZE_LINKEDIN_JOB') return false;
    (async () => {
      if (!/^https:\/\/(www\.)?linkedin\.com\/jobs\//i.test(location.href)) throw new Error('Open an individual LinkedIn job listing first.');
      const cached = await chrome.runtime.sendMessage({ type: 'JEV_GET_JOB_CACHE', key: cacheKey });
      if (cached[cacheKey]) { render(cached[cacheKey]); return cached[cacheKey]; }
      const config = await chrome.runtime.sendMessage({ type: 'JEV_GET_CONFIG' });
      if (config?.enabled === false) throw new Error('JEV Verify is disabled in the extension settings.');
      const job = extractJob();
      if (!job.title && !job.description) throw new Error('Could not find job details. Open a job in LinkedIn Jobs and try again.');
      const response = await chrome.runtime.sendMessage({ type: 'JEV_VERIFY_JOB', payload: job });
      if (!response?.ok) throw new Error(response?.error || 'Verification failed.');
      await chrome.runtime.sendMessage({ type: 'JEV_SET_JOB_CACHE', key: cacheKey, value: response.data.verification });
      render(response.data.verification);
      return response.data.verification;
    })().then((verification) => sendResponse({ ok: true, verification })).catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  });
})();

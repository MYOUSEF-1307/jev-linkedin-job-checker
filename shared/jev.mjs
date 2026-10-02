const SYSTEMONE_ENDPOINT = process.env.OPENCODE_SYSTEMONE_URL || 'https://opencode.ai/zen/v1/systemone';
const JEV_MODEL = process.env.OPENCODE_MODEL || 'jev-1.13-free';
const RETRY_STATUSES = new Set([429, 502, 503, 504, 529]);
const RETRY_DELAYS_MS = [400, 1000, 2000, 4000];

export function getApiKey() {
  const key = process.env.OPENCODE_API_KEY;
  if (!key) throw new Error('Missing OPENCODE_API_KEY. Copy .env.example to .env and set your OpenCode Zen API key.');
  return key;
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function number(value, fallback = 0) { return typeof value === 'number' && Number.isFinite(value) ? value : fallback; }
function text(value, limit) { return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit); }

export async function evaluateJev({ state, questions }, { apiKey, retries = RETRY_DELAYS_MS.length } = {}) {
  const key = apiKey || getApiKey();
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(SYSTEMONE_ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: JEV_MODEL, state, questions }),
      });
      const body = await res.text();
      let data;
      try { data = JSON.parse(body); } catch { throw new Error(`OpenCode Zen returned non-JSON response (${res.status}): ${body.slice(0, 300)}`); }
      if (res.ok) return data;
      lastError = new Error(`OpenCode Zen Jev error ${res.status}: ${data?.error?.message || data?.message || body.slice(0, 300)}`);
      if (!RETRY_STATUSES.has(res.status) || attempt === retries) throw lastError;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt === retries || !/fetch failed|network|OpenCode Zen Jev error (429|502|503|504|529)/i.test(lastError.message)) throw lastError;
    }
    await sleep(RETRY_DELAYS_MS[attempt]);
  }
  throw lastError || new Error('OpenCode Zen Jev request failed after retries');
}

export function buildJobQuestions() {
  return {
    listing_status: {
      type: 'choice',
      instructions: 'Assess this LinkedIn job listing only from the supplied content. Do not claim external verification. Choose suspicious only for strong scam or impersonation indicators; choose insufficient_information when the supplied content cannot support a reliable assessment.',
      criteria: {
        likely_legitimate: 'Specific, consistent employer and role details with no material scam indicators in the supplied content.',
        needs_caution: 'Meaningful warning signs exist but not enough evidence supports calling it likely suspicious.',
        suspicious: 'Strong scam, impersonation, payment, or off-platform-contact indicators are present.',
        insufficient_information: 'Too little reliable listing information is supplied to assess it.',
        unrelated: 'The page content is not a job listing.',
      },
    },
    likely_scam: {
      type: 'noul',
      instructions: 'Based only on this listing, is it likely to be a scam or impersonation attempt? Look for payment requests, unsafe requests for sensitive data, Telegram or WhatsApp-only contact, implausible compensation, off-platform application pressure, and inconsistent employer details.',
      criteria: { true: 'Strong scam or impersonation indicators are present.', false: 'No strong scam indicators are present in the supplied content.' },
    },
    employer_credibility: {
      type: 'score',
      instructions: 'Rate how credible and identifiable the employer appears from this listing alone.',
      criteria: ['No identifiable employer or highly inconsistent information', 'Very limited or questionable employer details', 'Some credible details but important gaps', 'Specific and internally consistent employer details', 'Strong employer identity and official application path'],
    },
    listing_quality: {
      type: 'score',
      instructions: 'Rate whether the role description, requirements, and application details resemble a normal professional job listing.',
      criteria: ['Clearly abnormal or scam-like', 'Multiple major warning signs', 'Mixed or sparse information', 'Mostly normal and specific information', 'Detailed and internally consistent professional listing'],
    },
    primary_concern: {
      type: 'choice',
      instructions: 'Select the most important concern visible in the supplied listing. Choose none when no material warning sign is visible.',
      criteria: {
        none: 'No material warning sign visible.', missing_employer: 'Employer identity is missing, vague, or inconsistent.', payment_or_data_request: 'The listing requests money, payment, or sensitive data unsafely.', off_platform_contact: 'It pressures applicants to contact someone through WhatsApp, Telegram, SMS, or similar channels.', unrealistic_terms: 'Compensation, requirements, or promises appear implausible or contradictory.', vague_description: 'The description is unusually vague or lacks normal role details.', external_link_risk: 'The application URL or instructions appear suspicious or unrelated to the stated employer.',
      },
    },
  };
}

function signalsFor({ concern, scamProbability, employerScore, qualityScore, listing }) {
  const signals = [];
  if (concern !== 'none') signals.push(concern.replaceAll('_', ' '));
  if (scamProbability >= 0.6) signals.push('high scam-risk probability from listing content');
  if (employerScore < 2) signals.push('weak employer identification');
  if (qualityScore < 2) signals.push('low listing detail or consistency');
  if (/\b(pay|fee|deposit|registration fee|bitcoin|crypto|telegram|whatsapp)\b/i.test(listing.description)) signals.push('payment or off-platform-contact language detected');
  return [...new Set(signals)].slice(0, 4);
}

export async function verifyLinkedInJob(job, { apiKey } = {}) {
  const listing = {
    url: text(job.url, 1000), title: text(job.title, 300), company: text(job.company, 300), location: text(job.location, 300), workplaceType: text(job.workplaceType, 120), postedDate: text(job.postedDate, 160), applicantCount: text(job.applicantCount, 120), employmentType: text(job.employmentType, 160), description: text(job.description, 12000), externalApplyUrl: text(job.externalApplyUrl, 1000),
  };
  if (!listing.title && !listing.description) throw new Error('No LinkedIn job details were found. Open an individual job listing and try again.');
  const data = await evaluateJev({ state: { source: 'LinkedIn job listing', listing }, questions: buildJobQuestions() }, { apiKey });
  const answers = data?.answers;
  if (!answers || typeof answers !== 'object') throw new Error('Jev returned an invalid job-verification response.');
  const status = answers.listing_status?.choice || 'insufficient_information';
  const scamProbability = number(answers.likely_scam?.noul, 0.5);
  const employerCredibility = number(answers.employer_credibility?.score, 0);
  const listingQuality = number(answers.listing_quality?.score, 0);
  const primaryConcern = answers.primary_concern?.choice || 'none';
  const risk = Math.max(0, Math.min(100, Math.round(scamProbability * 65 + (4 - employerCredibility) * 7 + (4 - listingQuality) * 4)));
  return {
    model: data.model || JEV_MODEL, usage: data.usage || null,
    verification: {
      status, confidence: number(answers.listing_status?.confidence, 0.5), risk,
      likelyScamProbability: scamProbability, employerCredibility, listingQuality, primaryConcern,
      signals: signalsFor({ concern: primaryConcern, scamProbability, employerScore: employerCredibility, qualityScore: listingQuality, listing }),
      disclaimer: 'This is a risk assessment based on listing content, not proof that a job or company is real or fake.',
    },
  };
}

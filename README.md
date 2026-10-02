# JEV Verify — LinkedIn Job Checker

A Chrome Manifest V3 extension that checks individual LinkedIn job listings for scam and legitimacy signals using Jev through OpenCode Zen. It is an explicit, on-demand risk assessment—not proof that an employer or role is real or fake.

## User flow

1. Open an individual LinkedIn job listing (`linkedin.com/jobs/...`).
2. Click the JEV Verify extension icon.
3. Click **Verify this job with JEV**.
4. Review the compact report and in-page panel: likely legitimate, needs caution, likely suspicious, or insufficient information.

The extension does not send API requests merely because you browse LinkedIn. Results are cached for the current tab session.

## Setup

Create `.env` from `.env.example` and set:

```env
OPENCODE_API_KEY=your_opencode_zen_key
OPENCODE_MODEL=jev-1.13-free
```

Start the proxy from the project root:

```powershell
node server/dev-server.mjs
```

Then load the `extension/` directory through Chrome's `chrome://extensions` page with Developer mode enabled. The popup API base URL should be `http://localhost:8787`.

## API

`POST /api/verify-job` receives the extracted job data and returns a status, risk score, confidence, and listing-derived warning signals. Jev assesses only supplied content; it does not independently verify companies or recruiters against external sources.

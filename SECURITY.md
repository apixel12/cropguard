# Security

CropGuard is a static, offline-first web app. All image analysis runs on the
user's device; there is no backend, no account, no analytics, and photos are
never uploaded.

## Reporting a vulnerability

Please report privately through GitHub's
[security advisory form](https://github.com/apixel12/impact-hacks-/security/advisories/new)
rather than a public issue. We aim to acknowledge within 7 days.
The machine-readable contact is at `/.well-known/security.txt` (RFC 9116).

## Threat model

| Asset | Threat | Control |
|---|---|---|
| User photos and videos | Exfiltration | CSP `connect-src 'self'`, no third-party scripts, no network calls during analysis (verified offline in the end-to-end test) |
| The page | Cross-site scripting | Strict CSP: no inline or `eval` scripts, no inline styles; Trusted Types enforced, so the DOM refuses HTML/script strings; React escaping; no `innerHTML` anywhere |
| The page | Clickjacking, cross-window attacks | `frame-ancestors 'none'`, `X-Frame-Options: DENY`, COOP + COEP (cross-origin isolated), CORP `same-origin`, `Origin-Agent-Cluster` |
| Model files | Tampering, corrupted cache, truncated download | SHA-256 of every model file compiled into the hashed JS bundle; each file is verified before use (`src/security/integrity.ts`) |
| Model output | Confident wrong answers | Image-quality gate, plant router, confidence cutoff, "Uncertain" state, self-test on load |
| Uploaded files | Decompression bombs, non-images, huge videos | Type, size (60 MB photo / 200 MB video), pixel-count (200 MP) and duration (60 s) limits before decoding |
| Device features | Over-broad permissions | `Permissions-Policy`: camera for this origin only; microphone, location, sensors, payment, USB etc. disabled |
| Transport | Downgrade / MITM | HTTPS only, HSTS (2 years, preload), `upgrade-insecure-requests` |
| Dependencies | Supply chain | Lockfile, `npm audit` before each release (0 known vulnerabilities), Dependabot weekly |

Local history (IndexedDB) stays on the device; the user can delete it in the app.

## Headers

The production headers live in `security-headers.json` and are copied verbatim
into `vercel.json`; `npm run preview` serves the same set, and
`tests/security.test.ts` fails if the two ever drift. The end-to-end test
(`npm run test:e2e`) fails on any CSP or Trusted Types violation.

Check a deployment with [Mozilla HTTP Observatory](https://developer.mozilla.org/en-US/observatory)
or [securityheaders.com](https://securityheaders.com).

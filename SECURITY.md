# Security

CropGuard is an offline-first web app. All image analysis runs on the user's device;
photos are never uploaded and there are no analytics. Accounts are **optional** and only
sync check results (Supabase; see docs/AUTH_SETUP.md).

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

## Optional accounts: control checklist

Built to OWASP ASVS 4.0 (authentication V2, sessions V3, access control V4), the OWASP
Authentication / Password Storage / Forgot Password cheat sheets and NIST SP 800-63B.

| Requirement | How CropGuard meets it | Where |
|---|---|---|
| Don't build your own credential store | Supabase Auth (bcrypt hashing, rate limits, email verification, TOTP MFA) | `src/auth/client.ts` |
| Passwords ≥ 12 chars, up to 64, any characters, no composition rules (NIST 5.1.1.2) | Client + server rule; paste and password managers allowed; show-password toggle | `src/auth/password.ts` |
| Reject breached passwords (NIST 5.1.1.2) | Have I Been Pwned range API, k-anonymity (5 hash chars leave the device) | `src/auth/password.ts` |
| bcrypt 72-byte truncation | Passwords over 72 bytes refused | `src/auth/password.ts` |
| No user enumeration (ASVS 2.2) | One generic sign-in error; sign-up and reset show the same message whether or not the email exists | `src/auth/AuthProvider.tsx` |
| Brute-force protection (ASVS 2.2.1) | Progressive client delay after 5 failures + Supabase server rate limits | `AuthProvider.tsx`, dashboard |
| Multi-factor (ASVS 2.7/2.8) | Optional TOTP; with it enabled the database itself refuses non-AAL2 sessions | `0001_cropguard.sql` |
| Re-authentication for sensitive actions (ASVS 3.7) | Password change and account deletion re-check the current password | `AuthProvider.tsx` |
| Session management (ASVS 3) | Short-lived JWT + rotating refresh token; sign out here or everywhere; PKCE flow, codes removed from the URL | `client.ts`, `AuthProvider.tsx` |
| Access control on data (ASVS 4.1/4.2) | Row-level security: each user reads/writes only their own rows; anon has no access; field length and value checks; per-user row cap | `0001_cropguard.sql` |
| Data minimisation / privacy | Results only, never photos; 13+ confirmation; privacy policy; in-app account deletion with all data | `historySync.ts`, `Privacy.tsx` |
| XSS cannot steal sessions easily | Strict CSP (no inline/eval), Trusted Types, connect-src limited to self + the exact Supabase project + HIBP | `security-headers.json` |
| Secrets | Only the public anon key is used; the build fails if the CSP doesn't match the configured project; `.env.local` is git-ignored; tests forbid the service key in app code | `vite.config.ts`, `tests/security.test.ts` |

Not yet independently verified: an external penetration test. Recommended before wide release:
OWASP ZAP baseline scan and Mozilla HTTP Observatory against the deployed URL.

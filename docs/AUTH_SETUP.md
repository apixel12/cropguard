# Setting up optional accounts (Supabase)

Accounts are optional: without this setup CropGuard works exactly as before and shows no
Account button. With it, signed-in users can back up their check **results** (never photos)
and see them on other devices.

## 1. Create the project (you, in the browser)
1. Sign up at supabase.com (free plan) and create a project. Choose the region closest to your users.
2. **SQL Editor → New query**: paste `supabase/migrations/0001_cropguard.sql` and **Run**.

## 2. Authentication settings (Dashboard → Authentication)
| Setting | Value | Why |
|---|---|---|
| Sign In / Providers → Email | Enabled; **Confirm email: ON** | Accounts must prove they own the email |
| Sign In / Providers → Email → Secure email change | ON | Both old and new address must confirm |
| Sign In / Providers → Email → Secure password change | ON | Requires recent sign-in to change password |
| Policies → Password: minimum length | **12** | Server-side copy of the app's rule (NIST 800-63B) |
| Policies → Password: required characters | None | NIST advises against composition rules |
| Multi-Factor → TOTP (authenticator app) | Enabled | Optional two-factor for users |
| Rate Limits | Keep defaults or lower | Server-side brute-force protection |
| URL Configuration → Site URL | Your Vercel URL, e.g. `https://cropguard-olive.vercel.app` | Where email links return |
| URL Configuration → Redirect URLs | The same URL (and `http://localhost:5173` for development) | Only these may receive login codes |
| Attack Protection → CAPTCHA | Optional (Cloudflare Turnstile is free) | Bot sign-ups; needs CSP changes, not enabled by default |
| Leaked password protection | Pro plan only; the app checks breached passwords itself | |

Do **not** enable anonymous sign-ins or social providers unless you add them deliberately.

## 3. Connect the app (your Mac and Vercel)
1. Copy `.env.example` to `.env.local` and fill in **Project URL** and **anon (public) key** from
   Project Settings → API. Never use the `service_role` / secret key.
2. Run `node scripts/set-auth-csp.mjs`. It adds your exact project URL to the Content-Security-Policy
   (the build refuses to run until this is done).
3. In Vercel → Project → Settings → Environment Variables, add the same two variables.
4. Commit `security-headers.json` and `vercel.json`, then push.

## 4. Check it yourself
Create an account with your own email, confirm it, sign in, turn on two-factor, run a check,
sign in on a second device and confirm the result appears, then use **Delete my account**.

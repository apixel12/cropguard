// Puts the exact Supabase project origin (from VITE_SUPABASE_URL in .env.local or the
// environment) into the CSP connect-src of security-headers.json and vercel.json.
// No wildcards: the app may only talk to this origin, its own origin, and the
// Have I Been Pwned range API.  Run: node scripts/set-auth-csp.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
const env = existsSync('.env.local') ? Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter((l) => /^\s*VITE_SUPABASE_URL=/.test(l)).map((l) => l.trim().split('=').map((s) => s.trim()))) : {}
const url = process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL
if (!url || !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) { console.error('Set VITE_SUPABASE_URL=https://<project-ref>.supabase.co first'); process.exit(1) }
const connect = `connect-src 'self' ${url} https://api.pwnedpasswords.com`
const h = JSON.parse(readFileSync('security-headers.json', 'utf8'))
h['Content-Security-Policy'] = h['Content-Security-Policy'].replace(/connect-src [^;]+/, connect)
writeFileSync('security-headers.json', JSON.stringify(h, null, 2) + '\n')
const v = JSON.parse(readFileSync('vercel.json', 'utf8'))
v.headers[0].headers = Object.entries(h).map(([key, value]) => ({ key, value }))
writeFileSync('vercel.json', JSON.stringify(v, null, 2) + '\n')
console.log('CSP updated:', connect)

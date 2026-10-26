import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Optional accounts (sync scan history across devices). Configured with the
 * project URL and the PUBLIC anon key in .env.local / Vercel env vars:
 *   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
 *   VITE_SUPABASE_ANON_KEY=<anon / publishable key>
 * The anon key is public by design; every table is protected by row-level
 * security (supabase/migrations). The secret server-side key must never be
 * used in this app. Without configuration the app works exactly as before.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const authConfigured = !!(url && anonKey && /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url))

let client: SupabaseClient | null = null

export function supabase(): SupabaseClient {
  if (!authConfigured) throw new Error('Accounts are not set up for this copy of CropGuard.')
  client ??= createClient(url!, anonKey!, {
    auth: {
      flowType: 'pkce', // OWASP: authorization-code flow with PKCE, no tokens in URLs
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true, // email confirmation / password-reset links
      storageKey: 'cg-auth',
    },
  })
  return client
}

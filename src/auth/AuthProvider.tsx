import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Factor, User } from '@supabase/supabase-js'
import { authConfigured, supabase } from './client'

/**
 * Account state. Signing in is optional: CropGuard works fully offline without
 * an account; an account only syncs scan history (results, never photos).
 *
 * Security notes (OWASP ASVS v4 V2/V3, OWASP Authentication Cheat Sheet):
 * - generic error messages: the app never reveals whether an email has an account
 * - progressive client-side delay after failed sign-ins (server rate limits too)
 * - when a user has two-factor authentication, they are not "signed in" until the
 *   second factor is verified (AAL2); the database enforces the same rule (RLS)
 * - sensitive changes (password, account deletion) re-check the current password
 * - one-time codes from email links are removed from the address bar immediately
 */
export type AuthStatus = 'disabled' | 'loading' | 'signed-out' | 'needs-mfa' | 'signed-in'

interface AuthCtx {
  status: AuthStatus
  user: User | null
  recovery: boolean // arrived through a password-reset email: must set a new password
  factors: Factor[]
  lockedUntil: number // ms timestamp; sign-in is paused until then after repeated failures
  signUp(email: string, password: string): Promise<void>
  signIn(email: string, password: string): Promise<void>
  verifyMfa(code: string): Promise<void>
  signOut(everywhere?: boolean): Promise<void>
  requestReset(email: string): Promise<void>
  setNewPassword(password: string): Promise<void>
  changePassword(current: string, next: string): Promise<void>
  enrollTotp(): Promise<{ factorId: string; qr: string; secret: string }>
  confirmTotp(factorId: string, code: string): Promise<void>
  removeFactor(factorId: string): Promise<void>
  deleteAccount(password: string): Promise<void>
}

const Ctx = createContext<AuthCtx | null>(null)

/** One message for every sign-in failure, so attackers can't learn which emails exist. */
export const GENERIC_SIGNIN_ERROR = 'That email and password don’t match an account, or the email hasn’t been confirmed yet.'

const delayFor = (failures: number) => (failures < 5 ? 0 : Math.min(15 * 60_000, 30_000 * 2 ** (failures - 5)))

function cleanAuthParamsFromUrl() {
  const u = new URL(location.href)
  const had = ['code', 'error', 'error_code', 'error_description', 'type'].some((k) => u.searchParams.has(k)) || /access_token|refresh_token/.test(u.hash)
  if (!had) return
  for (const k of ['code', 'error', 'error_code', 'error_description', 'type']) u.searchParams.delete(k)
  u.hash = ''
  history.replaceState(history.state, '', u.pathname + (u.search.length > 1 ? u.search : ''))
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(authConfigured ? 'loading' : 'disabled')
  const [user, setUser] = useState<User | null>(null)
  const [recovery, setRecovery] = useState(false)
  const [factors, setFactors] = useState<Factor[]>([])
  const [lockedUntil, setLockedUntil] = useState(0)
  const failures = useRef(0)

  const refresh = useCallback(async () => {
    const sb = supabase()
    const { data } = await sb.auth.getUser()
    setUser(data.user ?? null)
    if (!data.user) {
      setFactors([])
      return setStatus('signed-out')
    }
    const f = await sb.auth.mfa.listFactors()
    setFactors(f.data?.totp ?? [])
    const aal = await sb.auth.mfa.getAuthenticatorAssuranceLevel()
    setStatus(aal.data && aal.data.nextLevel === 'aal2' && aal.data.currentLevel !== 'aal2' ? 'needs-mfa' : 'signed-in')
  }, [])

  useEffect(() => {
    if (!authConfigured) return
    const sb = supabase()
    const { data: sub } = sb.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      cleanAuthParamsFromUrl()
      // run outside the callback (supabase-js recommends not awaiting inside it)
      setTimeout(() => { refresh().catch(() => setStatus('signed-out')) }, 0)
    })
    refresh().catch(() => setStatus('signed-out'))
    return () => sub.subscription.unsubscribe()
  }, [refresh])

  const guard = () => {
    if (Date.now() < lockedUntil) throw new Error(`Too many attempts. Try again in ${Math.ceil((lockedUntil - Date.now()) / 1000)} seconds.`)
  }
  const fail = () => {
    failures.current += 1
    const d = delayFor(failures.current)
    if (d) setLockedUntil(Date.now() + d)
  }

  const api = useMemo<AuthCtx>(() => ({
    status, user, recovery, factors, lockedUntil,

    async signUp(email, password) {
      const { error } = await supabase().auth.signUp({
        email,
        password,
        options: { emailRedirectTo: location.origin, data: { age_13_plus: true } },
      })
      // Supabase answers the same way whether or not the email already exists
      // (with email confirmation on), so the app can't leak which emails are registered.
      if (error && !/registered|exists/i.test(error.message)) throw new Error(friendly(error.message))
    },

    async signIn(email, password) {
      guard()
      const { error } = await supabase().auth.signInWithPassword({ email, password })
      if (error) {
        fail()
        throw new Error(/rate|too many/i.test(error.message) ? 'Too many attempts. Wait a few minutes and try again.' : GENERIC_SIGNIN_ERROR)
      }
      failures.current = 0
      await refresh()
    },

    async verifyMfa(code) {
      guard()
      const sb = supabase()
      const factor = factors.find((f) => f.status === 'verified')
      if (!factor) throw new Error('No authenticator is set up for this account.')
      const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.replace(/\s/g, '') })
      if (error) {
        fail()
        throw new Error('That code didn’t work. Use the current 6-digit code from your authenticator app.')
      }
      failures.current = 0
      await refresh()
    },

    async signOut(everywhere = false) {
      await supabase().auth.signOut({ scope: everywhere ? 'global' : 'local' })
      setRecovery(false)
      await refresh()
    },

    async requestReset(email) {
      // Always reports success to the caller: never reveals whether the email exists.
      await supabase().auth.resetPasswordForEmail(email, { redirectTo: location.origin }).catch(() => {})
    },

    async setNewPassword(password) {
      const { error } = await supabase().auth.updateUser({ password })
      if (error) throw new Error(friendly(error.message))
      setRecovery(false)
      await refresh()
    },

    async changePassword(current, next) {
      const sb = supabase()
      if (!user?.email) throw new Error('Not signed in.')
      // re-authenticate before a sensitive change
      const re = await sb.auth.signInWithPassword({ email: user.email, password: current })
      if (re.error) throw new Error('Your current password is incorrect.')
      const { error } = await sb.auth.updateUser({ password: next })
      if (error) throw new Error(friendly(error.message))
    },

    async enrollTotp() {
      const sb = supabase()
      // clean up abandoned, unverified enrolments first
      for (const f of factors.filter((f) => f.status !== 'verified')) await sb.auth.mfa.unenroll({ factorId: f.id })
      const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: `CropGuard ${new Date().toISOString().slice(0, 10)}` })
      if (error || !data) throw new Error('Couldn’t start two-factor setup. Try again.')
      return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret }
    },

    async confirmTotp(factorId, code) {
      const { error } = await supabase().auth.mfa.challengeAndVerify({ factorId, code: code.replace(/\s/g, '') })
      if (error) throw new Error('That code didn’t work. Check your phone’s time is set automatically and try the current code.')
      await refresh()
    },

    async removeFactor(factorId) {
      const { error } = await supabase().auth.mfa.unenroll({ factorId })
      if (error) throw new Error('Couldn’t turn off two-factor. Sign in again and retry.')
      await refresh()
    },

    async deleteAccount(password) {
      const sb = supabase()
      if (!user?.email) throw new Error('Not signed in.')
      const re = await sb.auth.signInWithPassword({ email: user.email, password })
      if (re.error) throw new Error('Your password is incorrect.')
      const { error } = await sb.rpc('delete_my_account')
      if (error) throw new Error('Couldn’t delete the account. Try again.')
      await sb.auth.signOut({ scope: 'local' })
      await refresh()
    },
  }), [status, user, recovery, factors, lockedUntil, refresh])

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

/** Turn provider messages into plain language; never echo raw server errors. */
function friendly(msg: string): string {
  if (/password/i.test(msg) && /(short|length|characters)/i.test(msg)) return 'That password doesn’t meet the requirements.'
  if (/weak|pwned|leaked/i.test(msg)) return 'That password is too easy to guess or has appeared in a data breach.'
  if (/rate|too many/i.test(msg)) return 'Too many attempts. Wait a few minutes and try again.'
  if (/same.*password|different from/i.test(msg)) return 'Choose a password different from your current one.'
  if (/email/i.test(msg) && /invalid/i.test(msg)) return 'Enter a valid email address.'
  if (/reauth|recent/i.test(msg)) return 'For your security, sign in again and retry.'
  return 'Something went wrong. Try again.'
}

export function useAuth() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAuth outside provider')
  return c
}

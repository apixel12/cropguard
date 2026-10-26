import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { ArrowLeft, Eye, EyeSlash, ShieldCheck, SignOut, Trash, UserCircle } from '@phosphor-icons/react'
import { useAuth } from '../auth/AuthProvider'
import { checkNewPassword, localProblems, MAX_LENGTH, MIN_LENGTH, PROBLEM_TEXT } from '../auth/password'
import { syncNow } from '../sync/historySync'

interface Props { onBack: () => void; onPrivacy: () => void }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function PasswordField({ id, label, value, onChange, autoComplete }: { id: string; label: string; value: string; onChange: (v: string) => void; autoComplete: 'current-password' | 'new-password' }) {
  const [show, setShow] = useState(false)
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="pw">
        <input id={id} type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete} maxLength={MAX_LENGTH + 8} spellCheck={false} autoCapitalize="none" required />
        <button type="button" className="icon-btn" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}>
          {show ? <EyeSlash size={20} aria-hidden /> : <Eye size={20} aria-hidden />}
        </button>
      </div>
    </div>
  )
}

function Rules({ password, email }: { password: string; email: string }) {
  if (!password) return <p className="caption">At least {MIN_LENGTH} characters. Long passphrases (a few random words) are best. Breached passwords are not allowed.</p>
  const problems = localProblems(password, email)
  return problems.length
    ? <ul className="bullets caption" aria-live="polite">{problems.map((p) => <li key={p}>{PROBLEM_TEXT[p]}</li>)}</ul>
    : <p className="caption ok-text" aria-live="polite">Looks good. It will also be checked against known data breaches.</p>
}

function Notice({ kind, children }: { kind: 'error' | 'ok'; children: ReactNode }) {
  return <div className={`callout ${kind === 'error' ? 'attention' : ''}`} role={kind === 'error' ? 'alert' : 'status'}><div>{children}</div></div>
}

export default function Account({ onBack, onPrivacy }: Props) {
  const auth = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [age, setAge] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])

  const run = async (fn: () => Promise<void>) => {
    setErr(null); setMsg(null); setBusy(true)
    try { await fn() } catch (e) { setErr(e instanceof Error ? e.message : 'Something went wrong.') } finally { setBusy(false) }
  }
  const switchMode = (m: typeof mode) => { setMode(m); setErr(null); setMsg(null); setPassword('') }
  const locked = auth.lockedUntil > now
  const top = (
    <div className="topbar">
      <button className="icon-btn back" onClick={onBack}><ArrowLeft size={20} aria-hidden />Back</button>
    </div>
  )

  if (auth.status === 'disabled') return (
    <section className="screen">{top}
      <h1>Account</h1>
      <p className="lede">Accounts aren’t set up for this copy of CropGuard. Everything still works without one.</p>
    </section>
  )
  if (auth.status === 'loading') return <section className="screen">{top}<p className="status wait"><span className="spinner" aria-hidden />Checking your account…</p></section>

  // ---- arrived via a password-reset email
  if (auth.recovery && auth.user) return (
    <section className="screen">{top}
      <h1>Choose a new password</h1>
      <form className="form" onSubmit={(e: FormEvent) => { e.preventDefault(); run(async () => {
        const p = await checkNewPassword(password, auth.user?.email ?? '')
        if (p.length) throw new Error(PROBLEM_TEXT[p[0]])
        await auth.setNewPassword(password); setPassword(''); setMsg('Password changed. You’re signed in.')
      }) }}>
        <PasswordField id="np" label="New password" value={password} onChange={setPassword} autoComplete="new-password" />
        <Rules password={password} email={auth.user.email ?? ''} />
        {err && <Notice kind="error">{err}</Notice>}
        <button className="btn primary full" disabled={busy}>Save new password</button>
      </form>
      {msg && <Notice kind="ok">{msg}</Notice>}
    </section>
  )

  // ---- second factor
  if (auth.status === 'needs-mfa') return <MfaChallenge top={top} />

  if (auth.status === 'signed-in' && auth.user) return <SignedIn top={top} onPrivacy={onPrivacy} />

  // ---- signed out
  return (
    <section className="screen">{top}
      <div style={{ display: 'grid', gap: 'var(--s2)' }}>
        <h1>{mode === 'signup' ? 'Create an account' : mode === 'reset' ? 'Reset your password' : 'Sign in'}</h1>
        <p className="lede">Optional. An account backs up your check results so you can see them on another phone. Photos never leave your phone.</p>
      </div>
      <form className="form" noValidate onSubmit={(e: FormEvent) => { e.preventDefault(); run(async () => {
        const em = email.trim().toLowerCase()
        if (!EMAIL_RE.test(em)) throw new Error('Enter a valid email address.')
        if (mode === 'reset') {
          await auth.requestReset(em)
          setMsg('If an account uses that email, we’ve sent a link to reset the password. It expires soon, so use it promptly.')
          return
        }
        if (mode === 'signup') {
          if (!age) throw new Error('You must be 13 or older to create an account.')
          const p = await checkNewPassword(password, em)
          if (p.length) throw new Error(PROBLEM_TEXT[p[0]])
          await auth.signUp(em, password)
          setPassword('')
          setMsg('Check your email for a confirmation link. If that email already has an account, sign in or reset your password instead.')
          return
        }
        await auth.signIn(em, password)
        setPassword('')
      }) }}>
        <div className="field">
          <label htmlFor="em">Email</label>
          <input id="em" type="email" inputMode="email" autoComplete="username email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} spellCheck={false} autoCapitalize="none" required />
        </div>
        {mode !== 'reset' && (
          <PasswordField id="pw" label="Password" value={password} onChange={setPassword} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
        )}
        {mode === 'signup' && <Rules password={password} email={email} />}
        {mode === 'signup' && (
          <label className="check">
            <input type="checkbox" checked={age} onChange={(e) => setAge(e.target.checked)} required />
            <span>I am 13 or older, and I’ve read the <button type="button" className="text-link inline" onClick={onPrivacy}>privacy policy</button>.</span>
          </label>
        )}
        {err && <Notice kind="error">{err}</Notice>}
        {msg && <Notice kind="ok">{msg}</Notice>}
        <button className="btn primary full" disabled={busy || (mode === 'signin' && locked)}>
          {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : mode === 'reset' ? 'Send reset link' : locked ? `Try again in ${Math.ceil((auth.lockedUntil - now) / 1000)} s` : 'Sign in'}
        </button>
      </form>
      <div className="link-row">
        {mode !== 'signin' && <button className="text-link" onClick={() => switchMode('signin')}>I have an account</button>}
        {mode !== 'signup' && <button className="text-link" onClick={() => switchMode('signup')}>Create an account</button>}
        {mode === 'signin' && <button className="text-link" onClick={() => switchMode('reset')}>Forgot password?</button>}
      </div>
      <p className="fine-print">Accounts are run by Supabase. <button type="button" className="text-link inline" onClick={onPrivacy}>Privacy policy</button></p>
    </section>
  )
}

function MfaChallenge({ top }: { top: ReactNode }) {
  const auth = useAuth()
  const [code, setCode] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <section className="screen">{top}
      <h1>Two-factor check</h1>
      <p className="lede">Enter the 6-digit code from your authenticator app.</p>
      <form className="form" onSubmit={async (e) => { e.preventDefault(); setErr(null); setBusy(true)
        try { await auth.verifyMfa(code); setCode('') } catch (x) { setErr((x as Error).message) } finally { setBusy(false) } }}>
        <div className="field">
          <label htmlFor="otp">Code</label>
          <input id="otp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} required />
        </div>
        {err && <Notice kind="error">{err}</Notice>}
        <button className="btn primary full" disabled={busy}>Verify</button>
      </form>
      <button className="text-link" onClick={() => auth.signOut()}>Cancel and sign out</button>
    </section>
  )
}

function SignedIn({ top, onPrivacy }: { top: ReactNode; onPrivacy: () => void }) {
  const auth = useAuth()
  const email = auth.user?.email ?? ''
  const verified = auth.factors.filter((f) => f.status === 'verified')
  const [sync, setSync] = useState<string>('')
  const [enrol, setEnrol] = useState<{ factorId: string; qr: string; secret: string } | null>(null)
  const [code, setCode] = useState('')
  const [cur, setCur] = useState(''), [next, setNext] = useState('')
  const [delPw, setDelPw] = useState(''), [delWord, setDelWord] = useState('')
  const [err, setErr] = useState<string | null>(null), [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const run = async (fn: () => Promise<void>) => { setErr(null); setMsg(null); setBusy(true); try { await fn() } catch (e) { setErr((e as Error).message) } finally { setBusy(false) } }

  useEffect(() => {
    setSync('Syncing…')
    syncNow().then((r) => setSync(r.uploaded || r.downloaded ? `Synced: ${r.uploaded} sent, ${r.downloaded} received.` : 'Up to date.')).catch(() => setSync('Couldn’t sync right now. It will retry next time.'))
  }, [])

  return (
    <section className="screen">{top}
      <div style={{ display: 'grid', gap: 'var(--s2)' }}>
        <h1>Your account</h1>
        <p className="lede"><UserCircle size={20} aria-hidden style={{ verticalAlign: '-4px' }} /> {email}</p>
      </div>
      {err && <Notice kind="error">{err}</Notice>}
      {msg && <Notice kind="ok">{msg}</Notice>}

      <div className="panel"><section>
        <h3>History sync</h3>
        <p>Your check results (plant, condition, confidence, date) are backed up to this account. Photos never leave your phone.</p>
        <p className="caption" aria-live="polite">{sync}</p>
      </section></div>

      <div className="panel"><section>
        <h3><ShieldCheck size={18} aria-hidden style={{ verticalAlign: '-3px' }} /> Two-factor authentication</h3>
        {verified.length ? (
          <>
            <p>On. Signing in also needs a code from your authenticator app.</p>
            <button className="btn" disabled={busy} onClick={() => run(async () => { await auth.removeFactor(verified[0].id); setMsg('Two-factor authentication turned off.') })}>Turn off</button>
          </>
        ) : enrol ? (
          <form className="form" onSubmit={(e) => { e.preventDefault(); run(async () => { await auth.confirmTotp(enrol.factorId, code); setEnrol(null); setCode(''); setMsg('Two-factor authentication is on.') }) }}>
            <p>Scan this with an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…), then enter the 6-digit code it shows.</p>
            <img className="qr" src={enrol.qr} alt="QR code for your authenticator app" width={180} height={180} />
            <p className="caption">Can’t scan? Enter this key: <code className="secret">{enrol.secret}</code></p>
            <div className="field">
              <label htmlFor="totp">Code from the app</label>
              <input id="totp" inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} required />
            </div>
            <button className="btn primary" disabled={busy}>Turn on</button>
          </form>
        ) : (
          <>
            <p>Off. Add a second step to signing in with an authenticator app. Recommended.</p>
            <button className="btn" disabled={busy} onClick={() => run(async () => setEnrol(await auth.enrollTotp()))}>Set up</button>
          </>
        )}
      </section></div>

      <div className="panel"><section>
        <h3>Change password</h3>
        <form className="form" onSubmit={(e) => { e.preventDefault(); run(async () => {
          const p = await checkNewPassword(next, email)
          if (p.length) throw new Error(PROBLEM_TEXT[p[0]])
          await auth.changePassword(cur, next); setCur(''); setNext(''); setMsg('Password changed.')
        }) }}>
          <PasswordField id="cur" label="Current password" value={cur} onChange={setCur} autoComplete="current-password" />
          <PasswordField id="nxt" label="New password" value={next} onChange={setNext} autoComplete="new-password" />
          <Rules password={next} email={email} />
          <button className="btn" disabled={busy}>Change password</button>
        </form>
      </section></div>

      <div className="row-actions">
        <button className="btn" onClick={() => run(() => auth.signOut())}><SignOut size={20} aria-hidden />Sign out</button>
        <button className="btn" onClick={() => run(() => auth.signOut(true))}>Sign out everywhere</button>
      </div>

      <div className="panel"><section>
        <h3>Delete account</h3>
        <p>Deletes your account and all synced results for good. History saved on this phone stays until you delete it.</p>
        <form className="form" onSubmit={(e) => { e.preventDefault(); run(async () => {
          if (delWord !== 'DELETE') throw new Error('Type DELETE to confirm.')
          await auth.deleteAccount(delPw); setDelPw(''); setDelWord('')
        }) }}>
          <PasswordField id="dpw" label="Your password" value={delPw} onChange={setDelPw} autoComplete="current-password" />
          <div className="field">
            <label htmlFor="dw">Type DELETE to confirm</label>
            <input id="dw" value={delWord} onChange={(e) => setDelWord(e.target.value)} autoComplete="off" autoCapitalize="characters" />
          </div>
          <button className="btn danger" disabled={busy}><Trash size={20} aria-hidden />Delete my account</button>
        </form>
      </section></div>
      <button className="text-link" onClick={onPrivacy}>Privacy policy</button>
    </section>
  )
}

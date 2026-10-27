import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  ArrowLeft, ArrowRight, ArrowsClockwise, CaretDown, CheckCircle, CloudCheck, DeviceMobile, EnvelopeSimple, EnvelopeSimpleOpen,
  Eye, EyeSlash, Key, Lock, Plant, ShieldCheck, SignOut, Trash, WarningCircle, XCircle,
} from '@phosphor-icons/react'
import { useAuth } from '../auth/AuthProvider'
import { checkNewPassword, localProblems, MAX_LENGTH, MIN_LENGTH, PROBLEM_TEXT } from '../auth/password'
import { syncNow } from '../sync/historySync'

interface Props { onBack: () => void; onPrivacy: () => void }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function TopBar({ onBack }: { onBack: () => void }) {
  return (
    <div className="topbar">
      <button className="icon-btn back" onClick={onBack}><ArrowLeft size={20} aria-hidden />Back</button>
    </div>
  )
}

function Spinner() { return <span className="spinner" aria-hidden /> }

/** Primary submit button: shows a spinner and a "…ing" label while busy. */
function Submit({ busy, busyText, disabled, children, variant = 'primary' }: { busy: boolean; busyText: string; disabled?: boolean; children: ReactNode; variant?: 'primary' | 'danger' | '' }) {
  return (
    <button className={`btn ${variant} full`} disabled={busy || disabled} aria-busy={busy}>
      {busy ? <><Spinner />{busyText}</> : children}
    </button>
  )
}

function EmailField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="field">
      <label htmlFor="em">Email</label>
      <div className="input">
        <EnvelopeSimple size={20} aria-hidden />
        <input id="em" type="email" inputMode="email" autoComplete="username email" placeholder="you@example.com" value={value}
          onChange={(e) => onChange(e.target.value)} maxLength={254} spellCheck={false} autoCapitalize="none" required />
      </div>
    </div>
  )
}

function PasswordField({ id, label, value, onChange, autoComplete, aside }: { id: string; label: string; value: string; onChange: (v: string) => void; autoComplete: 'current-password' | 'new-password'; aside?: ReactNode }) {
  const [show, setShow] = useState(false)
  return (
    <div className="field">
      <div className="field-row"><label htmlFor={id} className="field-label">{label}</label>{aside}</div>
      <div className="input pw">
        <Lock size={20} aria-hidden />
        <input id={id} type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete} maxLength={MAX_LENGTH + 8} spellCheck={false} autoCapitalize="none" required />
        <button type="button" className="icon-btn" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}>
          {show ? <EyeSlash size={20} aria-hidden /> : <Eye size={20} aria-hidden />}
        </button>
      </div>
    </div>
  )
}

const STRENGTH = ['', 'Too weak', 'Okay', 'Strong', 'Very strong']

/** Live feedback for a new password: a 4-step meter plus any rule it breaks. */
function Strength({ password, email }: { password: string; email: string }) {
  if (!password) return <p className="caption">At least {MIN_LENGTH} characters. Long passphrases (a few random words) are best. Breached passwords are not allowed.</p>
  const problems = localProblems(password, email)
  const n = [...password].length
  const score = problems.length ? 1 : n >= 24 ? 4 : n >= 16 ? 3 : 2
  return (
    <div className="strength" data-score={score} aria-live="polite">
      <div className="bars" aria-hidden>{[1, 2, 3, 4].map((i) => <span key={i} className={i <= score ? 'on' : ''} />)}</div>
      <p className="label"><span>Password strength</span><b>{STRENGTH[score]}</b></p>
      {problems.length
        ? <ul className="rules">{problems.map((p) => <li key={p}><XCircle size={16} weight="fill" aria-hidden />{PROBLEM_TEXT[p]}</li>)}</ul>
        : <p className="caption ok-text">Looks good. It will also be checked against known data breaches.</p>}
    </div>
  )
}

function Notice({ kind, children }: { kind: 'error' | 'ok'; children: ReactNode }) {
  return (
    <div className={`callout ${kind === 'error' ? 'attention' : 'ok'}`} role={kind === 'error' ? 'alert' : 'status'}>
      {kind === 'error' ? <WarningCircle size={20} weight="fill" aria-hidden /> : <CheckCircle size={20} weight="fill" aria-hidden />}
      <div>{children}</div>
    </div>
  )
}

/** Six-digit code: one real input (paste and autofill work) drawn as six boxes. */
function OtpInput({ id, label, value, onChange, onComplete }: { id: string; label: string; value: string; onChange: (v: string) => void; onComplete?: (v: string) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  const digits = value.replace(/\D/g, '').slice(0, 6)
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="otp" onClick={() => ref.current?.focus()}>
        <input ref={ref} id={id} value={digits} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} required
          onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 6); onChange(v); if (v.length === 6) onComplete?.(v) }} />
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} aria-hidden className={`slot${digits[i] ? ' filled' : ''}${i === Math.min(digits.length, 5) ? ' active' : ''}`}>{digits[i] ?? ''}</span>
        ))}
      </div>
    </div>
  )
}

export default function Account({ onBack, onPrivacy }: Props) {
  const auth = useAuth()
  const top = <TopBar onBack={onBack} />

  if (auth.status === 'disabled') return (
    <section className="screen">{top}
      <h1>Account</h1>
      <p className="lede">Accounts aren’t set up for this copy of CropGuard. Everything still works without one.</p>
    </section>
  )
  if (auth.status === 'loading') return <section className="screen">{top}<p className="status wait"><Spinner />Checking your account…</p></section>
  if (auth.recovery && auth.user) return <NewPassword top={top} />
  if (auth.status === 'needs-mfa') return <MfaChallenge top={top} />
  if (auth.status === 'signed-in' && auth.user) return <SignedIn top={top} onPrivacy={onPrivacy} />
  return <SignedOut top={top} onPrivacy={onPrivacy} />
}

// ---------------------------------------------------------------- signed out

type Mode = 'signin' | 'signup' | 'reset'
const HEAD: Record<Mode, { title: string; lede: string }> = {
  signin: { title: 'Welcome back', lede: 'Sign in to back up your check results and see them on your other phones.' },
  signup: { title: 'Create your account', lede: 'Optional. An account backs up your check results. Photos never leave your phone.' },
  reset: { title: 'Reset your password', lede: 'Enter your email and we’ll send you a link to choose a new password.' },
}

function SignedOut({ top, onPrivacy }: { top: ReactNode; onPrivacy: () => void }) {
  const auth = useAuth()
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [age, setAge] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [sent, setSent] = useState<Mode | null>(null)
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])
  const locked = auth.lockedUntil > now

  const switchMode = (m: Mode) => { setMode(m); setErr(null); setSent(null); setPassword('') }
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setErr(null); setBusy(true)
    try {
      const em = email.trim().toLowerCase()
      if (!EMAIL_RE.test(em)) throw new Error('Enter a valid email address.')
      if (mode === 'reset') {
        await auth.requestReset(em)
        setSent('reset')
      } else if (mode === 'signup') {
        if (!age) throw new Error('You must be 13 or older to create an account.')
        const p = await checkNewPassword(password, em)
        if (p.length) throw new Error(PROBLEM_TEXT[p[0]])
        await auth.signUp(em, password)
        setPassword('')
        setSent('signup')
      } else {
        await auth.signIn(em, password)
        setPassword('')
      }
    } catch (x) {
      setErr(x instanceof Error ? x.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  if (sent) return (
    <section className="screen">{top}
      <div className="auth-head">
        <span className="emblem ok"><EnvelopeSimpleOpen size={28} weight="duotone" aria-hidden /></span>
        <h1>Check your email</h1>
      </div>
      <div className="auth-card swap" role="status">
        <p className="lede">
          {sent === 'signup'
            ? 'Check your email for a confirmation link. If that email already has an account, sign in or reset your password instead.'
            : 'If an account uses that email, we’ve sent a link to reset the password. It expires soon, so use it promptly.'}
        </p>
        <p className="caption">Nothing there after a few minutes? Look in your spam or junk folder.</p>
        <button className="btn primary full" onClick={() => switchMode('signin')}>Back to sign in</button>
      </div>
    </section>
  )

  const head = HEAD[mode]
  return (
    <section className="screen">{top}
      <div className="auth-head">
        <span className="emblem"><Plant size={28} weight="duotone" aria-hidden /></span>
        <h1 key={mode} className="swap">{head.title}</h1>
        <p className="lede">{head.lede}</p>
      </div>

      <div className="auth-card">
        {mode !== 'reset' && (
          <div className="mode-switch" role="tablist" aria-label="Account" data-value={mode === 'signup' ? 1 : 0}>
            <span className="thumb" aria-hidden />
            <button role="tab" aria-selected={mode === 'signin'} aria-controls="auth-form" onClick={() => switchMode('signin')}>Sign in</button>
            <button role="tab" aria-selected={mode === 'signup'} aria-controls="auth-form" onClick={() => switchMode('signup')}>Create account</button>
          </div>
        )}

        <form id="auth-form" key={mode} className="form swap" noValidate onSubmit={submit}>
          <EmailField value={email} onChange={setEmail} />
          {mode !== 'reset' && (
            <PasswordField id="pw" label="Password" value={password} onChange={setPassword}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              aside={mode === 'signin' && <button type="button" className="text-link" onClick={() => switchMode('reset')}>Forgot password?</button>} />
          )}
          {mode === 'signup' && <Strength password={password} email={email} />}
          {mode === 'signup' && (
            <label className="check">
              <input type="checkbox" checked={age} onChange={(e) => setAge(e.target.checked)} required />
              <span>I am 13 or older, and I’ve read the <button type="button" className="text-link inline" onClick={onPrivacy}>privacy policy</button>.</span>
            </label>
          )}
          {err && <Notice kind="error">{err}</Notice>}
          {mode === 'signin' && locked
            ? <button className="btn primary full" disabled>Try again in {Math.ceil((auth.lockedUntil - now) / 1000)} s</button>
            : (
              <Submit busy={busy} busyText={mode === 'signup' ? 'Creating account…' : mode === 'reset' ? 'Sending…' : 'Signing in…'}>
                {mode === 'signup' ? 'Create account' : mode === 'reset' ? 'Send reset link' : 'Sign in'}
                <ArrowRight className="arrow" size={18} weight="bold" aria-hidden />
              </Submit>
            )}
        </form>
        {mode === 'reset' && <button className="text-link" onClick={() => switchMode('signin')}>Back to sign in</button>}
      </div>

      <ul className="trust">
        <li><DeviceMobile size={18} aria-hidden />Photos never leave your phone. Only results are backed up.</li>
        <li><ShieldCheck size={18} aria-hidden />Passwords are checked against known breaches. Two-factor sign-in is available.</li>
      </ul>
      <p className="fine-print">Accounts are run by Supabase. <button type="button" className="text-link inline" onClick={onPrivacy}>Privacy policy</button></p>
    </section>
  )
}

// ---------------------------------------------------------------- reset link / second factor

function NewPassword({ top }: { top: ReactNode }) {
  const auth = useAuth()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  return (
    <section className="screen">{top}
      <div className="auth-head">
        <span className="emblem"><Key size={28} weight="duotone" aria-hidden /></span>
        <h1>Choose a new password</h1>
      </div>
      <form className="auth-card form" onSubmit={async (e) => {
        e.preventDefault(); setErr(null); setBusy(true)
        try {
          const p = await checkNewPassword(password, auth.user?.email ?? '')
          if (p.length) throw new Error(PROBLEM_TEXT[p[0]])
          await auth.setNewPassword(password); setPassword(''); setDone(true)
        } catch (x) { setErr((x as Error).message) } finally { setBusy(false) }
      }}>
        <PasswordField id="np" label="New password" value={password} onChange={setPassword} autoComplete="new-password" />
        <Strength password={password} email={auth.user?.email ?? ''} />
        {err && <Notice kind="error">{err}</Notice>}
        {done && <Notice kind="ok">Password changed. You’re signed in.</Notice>}
        <Submit busy={busy} busyText="Saving…">Save new password</Submit>
      </form>
    </section>
  )
}

function MfaChallenge({ top }: { top: ReactNode }) {
  const auth = useAuth()
  const [code, setCode] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const verify = async (c: string) => {
    if (busy) return
    setErr(null); setBusy(true)
    try { await auth.verifyMfa(c); setCode('') } catch (x) { setErr((x as Error).message); setCode('') } finally { setBusy(false) }
  }
  return (
    <section className="screen">{top}
      <div className="auth-head">
        <span className="emblem"><ShieldCheck size={28} weight="duotone" aria-hidden /></span>
        <h1>Two-factor check</h1>
        <p className="lede">Enter the 6-digit code from your authenticator app.</p>
      </div>
      <form className="auth-card form" onSubmit={(e) => { e.preventDefault(); verify(code) }}>
        <OtpInput id="otp" label="Code" value={code} onChange={setCode} onComplete={verify} />
        {err && <Notice kind="error">{err}</Notice>}
        <Submit busy={busy} busyText="Checking…">Verify</Submit>
      </form>
      <button className="text-link" onClick={() => auth.signOut()}>Cancel and sign out</button>
    </section>
  )
}

// ---------------------------------------------------------------- signed in

type Area = 'mfa' | 'password' | 'session' | 'delete'

function SignedIn({ top, onPrivacy }: { top: ReactNode; onPrivacy: () => void }) {
  const auth = useAuth()
  const email = auth.user?.email ?? ''
  const verified = auth.factors.filter((f) => f.status === 'verified')
  const [sync, setSync] = useState<{ state: 'busy' | 'ok' | 'bad'; text: string }>({ state: 'busy', text: 'Syncing…' })
  const [enrol, setEnrol] = useState<{ factorId: string; qr: string; secret: string } | null>(null)
  const [code, setCode] = useState('')
  const [cur, setCur] = useState(''), [next, setNext] = useState('')
  const [delPw, setDelPw] = useState(''), [delWord, setDelWord] = useState('')
  const [note, setNote] = useState<{ area: Area; kind: 'error' | 'ok'; text: string } | null>(null)
  const [busy, setBusy] = useState<Area | null>(null)
  const run = async (area: Area, fn: () => Promise<string | void>) => {
    setNote(null); setBusy(area)
    try { const ok = await fn(); if (ok) setNote({ area, kind: 'ok', text: ok }) } catch (e) { setNote({ area, kind: 'error', text: (e as Error).message }) } finally { setBusy(null) }
  }
  const noteFor = (area: Area) => note?.area === area && <Notice kind={note.kind}>{note.text}</Notice>

  const doSync = () => {
    setSync({ state: 'busy', text: 'Syncing…' })
    syncNow()
      .then((r) => setSync({ state: 'ok', text: r.uploaded || r.downloaded ? `Synced: ${r.uploaded} sent, ${r.downloaded} received` : 'Up to date' }))
      .catch(() => setSync({ state: 'bad', text: 'Couldn’t sync. Will retry later' }))
  }
  useEffect(doSync, [])

  return (
    <section className="screen">{top}
      <h1>Your account</h1>

      <div className="profile">
        <span className="avatar lg" aria-hidden>{email.charAt(0)}</span>
        <span className="grow">
          <span className="email">{email}</span>
          <span className={`badge ${sync.state === 'ok' ? 'healthy' : sync.state === 'bad' ? 'uncertain' : ''}`} aria-live="polite">
            {sync.state === 'busy' ? <ArrowsClockwise className="spin" size={14} aria-hidden /> : sync.state === 'ok' ? <CloudCheck size={14} weight="fill" aria-hidden /> : <WarningCircle size={14} aria-hidden />}
            {sync.text}
          </span>
        </span>
        <button className="icon-btn" onClick={doSync} disabled={sync.state === 'busy'} aria-label="Sync now"><ArrowsClockwise size={20} aria-hidden /></button>
      </div>
      <p className="caption">Your check results (plant, condition, confidence, date) are backed up to this account. Photos never leave your phone.</p>

      <div>
        <h2 className="group-title">Security</h2>
        <div className="stack">
          <div className="panel">
            <div className="setting">
              <span className="icon"><ShieldCheck size={22} aria-hidden /></span>
              <span className="grow"><h3>Two-factor authentication</h3><span className="caption">A code from an authenticator app when you sign in</span></span>
              <span className={`badge ${verified.length ? 'healthy' : 'uncertain'}`}>{verified.length ? 'On' : 'Off'}</span>
            </div>
            {verified.length ? (
              <button className="btn" disabled={!!busy} onClick={() => run('mfa', async () => { await auth.removeFactor(verified[0].id); return 'Two-factor authentication turned off.' })}>Turn off</button>
            ) : enrol ? (
              <form className="form swap" onSubmit={(e) => { e.preventDefault(); run('mfa', async () => { await auth.confirmTotp(enrol.factorId, code); setEnrol(null); setCode(''); return 'Two-factor authentication is on.' }) }}>
                <p>Scan this with an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…), then enter the 6-digit code it shows.</p>
                <img className="qr" src={enrol.qr} alt="QR code for your authenticator app" width={180} height={180} />
                <p className="caption">Can’t scan? Enter this key: <code className="secret">{enrol.secret}</code></p>
                <OtpInput id="totp" label="Code from the app" value={code} onChange={setCode} />
                <div className="row-2">
                  <button type="button" className="btn ghost" onClick={() => { setEnrol(null); setCode('') }}>Cancel</button>
                  <Submit busy={busy === 'mfa'} busyText="Checking…">Turn on</Submit>
                </div>
              </form>
            ) : (
              <button className="btn primary" disabled={!!busy} onClick={() => run('mfa', async () => setEnrol(await auth.enrollTotp()))}>
                {busy === 'mfa' ? <><Spinner />Setting up…</> : 'Set up two-factor'}
              </button>
            )}
            {noteFor('mfa')}
          </div>

          <details className="panel">
            <summary>
              <span className="setting"><span className="icon"><Key size={22} aria-hidden /></span><span className="grow">Change password</span></span>
              <CaretDown size={18} aria-hidden />
            </summary>
            <form className="disclosure-body form" onSubmit={(e) => { e.preventDefault(); run('password', async () => {
              const p = await checkNewPassword(next, email)
              if (p.length) throw new Error(PROBLEM_TEXT[p[0]])
              await auth.changePassword(cur, next); setCur(''); setNext('')
              return 'Password changed.'
            }) }}>
              <PasswordField id="cur" label="Current password" value={cur} onChange={setCur} autoComplete="current-password" />
              <PasswordField id="nxt" label="New password" value={next} onChange={setNext} autoComplete="new-password" />
              <Strength password={next} email={email} />
              {noteFor('password')}
              <Submit busy={busy === 'password'} busyText="Saving…" variant="">Change password</Submit>
            </form>
          </details>
        </div>
      </div>

      <div>
        <h2 className="group-title">Sessions</h2>
        <div className="row-2">
          <button className="btn" disabled={!!busy} onClick={() => run('session', () => auth.signOut())}><SignOut size={20} aria-hidden />Sign out</button>
          <button className="btn" disabled={!!busy} onClick={() => run('session', () => auth.signOut(true))}>Sign out everywhere</button>
        </div>
        {noteFor('session')}
      </div>

      <details className="panel danger-zone">
        <summary>
          <span className="setting"><span className="icon"><Trash size={22} aria-hidden /></span><span className="grow">Delete account</span></span>
          <CaretDown size={18} aria-hidden />
        </summary>
        <form className="disclosure-body form" onSubmit={(e) => { e.preventDefault(); run('delete', async () => {
          if (delWord !== 'DELETE') throw new Error('Type DELETE to confirm.')
          await auth.deleteAccount(delPw); setDelPw(''); setDelWord('')
        }) }}>
          <p>Deletes your account and all synced results for good. History saved on this phone stays until you delete it.</p>
          <PasswordField id="dpw" label="Your password" value={delPw} onChange={setDelPw} autoComplete="current-password" />
          <div className="field">
            <label htmlFor="dw">Type DELETE to confirm</label>
            <input id="dw" value={delWord} onChange={(e) => setDelWord(e.target.value)} autoComplete="off" autoCapitalize="characters" />
          </div>
          {noteFor('delete')}
          <Submit busy={busy === 'delete'} busyText="Deleting…" variant="danger"><Trash size={20} aria-hidden />Delete my account</Submit>
        </form>
      </details>
      <button className="text-link" onClick={onPrivacy}>Privacy policy</button>
    </section>
  )
}

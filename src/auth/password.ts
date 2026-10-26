/**
 * Password rules (NIST SP 800-63B §3.1.1.2, OWASP Authentication Cheat Sheet):
 * - at least 12 characters (stronger than NIST's 8 minimum), all characters and
 *   spaces allowed, no composition rules (they make passwords weaker in practice)
 * - at most 64 characters: Supabase hashes with bcrypt, which ignores bytes past 72,
 *   so longer passwords would silently be truncated
 * - rejected if it appears in a known data breach (Have I Been Pwned, k-anonymity:
 *   only the first 5 hex characters of the SHA-1 hash leave the device), or if it
 *   contains the email name or is a trivially repetitive string
 */
export const MIN_LENGTH = 12
export const MAX_LENGTH = 64

export type PasswordProblem = 'too-short' | 'too-long' | 'too-long-bytes' | 'contains-email' | 'repetitive' | 'breached'

export const PROBLEM_TEXT: Record<PasswordProblem, string> = {
  'too-short': `Use at least ${MIN_LENGTH} characters. A few random words make a strong, memorable password.`,
  'too-long': `Use at most ${MAX_LENGTH} characters.`,
  'too-long-bytes': 'That password is too long once encoded. Use fewer special characters or emoji.',
  'contains-email': 'Don’t include your email name in your password.',
  repetitive: 'That password is too predictable (repeated or sequential characters).',
  breached: 'This password has appeared in a data breach, so attackers try it first. Choose a different one.',
}

const SEQUENCES = ['0123456789', 'abcdefghijklmnopqrstuvwxyz', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm']

/** Checks that need no network. */
export function localProblems(password: string, email = ''): PasswordProblem[] {
  const out: PasswordProblem[] = []
  const chars = [...password]
  if (chars.length < MIN_LENGTH) out.push('too-short')
  if (chars.length > MAX_LENGTH) out.push('too-long')
  else if (new TextEncoder().encode(password).length > 72) out.push('too-long-bytes')
  const name = email.split('@')[0]?.toLowerCase() ?? ''
  if (name.length >= 4 && password.toLowerCase().includes(name)) out.push('contains-email')
  const lower = password.toLowerCase()
  const distinct = new Set(lower).size
  // runs like 123456789012 or zyxwvuts: nearly every step is +1, -1 or a repeat (wrap 9->0 allowed)
  const codes = [...lower].map((c) => c.codePointAt(0)!)
  const steps = codes.slice(1).map((c, i) => c - codes[i])
  const easy = steps.filter((d) => Math.abs(d) <= 1 || d === -9 || d === 9).length
  const sequential = SEQUENCES.some((s) => s.includes(lower) || [...s].reverse().join('').includes(lower)) ||
    (steps.length > 0 && easy / steps.length >= 0.8)
  if (chars.length >= MIN_LENGTH && (distinct <= 3 || sequential)) out.push('repetitive')
  return out
}

async function sha1Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase()
}

/** Have I Been Pwned range API (k-anonymity). Returns null if the check can't run (offline). */
export async function isBreached(password: string, fetchFn: typeof fetch = fetch): Promise<boolean | null> {
  try {
    const hash = await sha1Hex(password)
    const prefix = hash.slice(0, 5), suffix = hash.slice(5)
    const res = await fetchFn(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'Add-Padding': 'true' }, // padded responses hide which prefix matched
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
    })
    if (!res.ok) return null
    const body = await res.text()
    return body.split('\n').some((line) => {
      const [s, count] = line.trim().split(':')
      return s === suffix && Number(count) > 0
    })
  } catch {
    return null
  }
}

/** Full check for a NEW password (sign-up, reset, change). */
export async function checkNewPassword(password: string, email = '', fetchFn: typeof fetch = fetch): Promise<PasswordProblem[]> {
  const problems = localProblems(password, email)
  if (problems.length) return problems
  // Fail closed only on a positive match; if the breach service is unreachable,
  // Supabase's own rules still apply and the user isn't locked out.
  return (await isBreached(password, fetchFn)) ? ['breached'] : []
}

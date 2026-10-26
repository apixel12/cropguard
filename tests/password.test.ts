import { describe, expect, it, vi } from 'vitest'
import { checkNewPassword, isBreached, localProblems, MIN_LENGTH } from '../src/auth/password'

const sha1 = async (s: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase()

describe('password rules (NIST SP 800-63B)', () => {
  it(`requires at least ${MIN_LENGTH} characters`, () => {
    expect(localProblems('short pass')).toContain('too-short')
    expect(localProblems('correct horse battery')).toEqual([])
  })
  it('allows spaces, unicode and pasted passphrases; no composition rules', () => {
    expect(localProblems('ünïcode fern tomato blight')).toEqual([])
    expect(localProblems('alllowercasewordshere')).toEqual([])
  })
  it('rejects passwords bcrypt would truncate (over 72 bytes)', () => {
    expect(localProblems('🌱'.repeat(20))).toContain('too-long-bytes')
    expect(localProblems('a'.repeat(65))).toContain('too-long')
  })
  it('rejects repetitive or sequential strings and the email name', () => {
    expect(localProblems('aaaaaaaaaaaaaa')).toContain('repetitive')
    expect(localProblems('abcdefghijklmn')).toContain('repetitive')
    expect(localProblems('123456789012')).toContain('repetitive')
    expect(localProblems('gardener-ani-2026!', 'gardener@example.com')).toContain('contains-email')
  })
})

describe('breached-password check (Have I Been Pwned, k-anonymity)', () => {
  it('sends only the first 5 hash characters and detects a match', async () => {
    const pw = 'correct horse battery staple'
    const h = await sha1(pw)
    const fetchFn = vi.fn(async (_url: string) => new Response(`0000000000000000000000000000000000A:0\n${h.slice(5)}:42\n`))
    expect(await isBreached(pw, fetchFn as never)).toBe(true)
    const url = fetchFn.mock.calls[0][0] as string
    expect(url).toBe(`https://api.pwnedpasswords.com/range/${h.slice(0, 5)}`)
    expect(url).not.toContain(h.slice(5)) // the rest of the hash never leaves the device
    expect(url).not.toContain(encodeURIComponent(pw))
  })
  it('padding entries with count 0 are not matches', async () => {
    const pw = 'mulch tomato sunrise river'
    const h = await sha1(pw)
    expect(await isBreached(pw, (async () => new Response(`${h.slice(5)}:0\n`)) as never)).toBe(false)
  })
  it('a breached password is refused for sign-up', async () => {
    const pw = 'password1234567'
    const h = await sha1(pw)
    expect(await checkNewPassword(pw, '', (async () => new Response(`${h.slice(5)}:9999\n`)) as never)).toEqual(['breached'])
  })
  it('if the breach service is unreachable, the local rules still apply and the user is not locked out', async () => {
    const offline = (async () => { throw new TypeError('offline') }) as never
    expect(await isBreached('anything long enough', offline)).toBeNull()
    expect(await checkNewPassword('fern lettuce compost wren', '', offline)).toEqual([])
  })
})

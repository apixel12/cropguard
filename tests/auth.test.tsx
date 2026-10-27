import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

// A fake Supabase client: no network, no real accounts.
const auth = {
  getUser: vi.fn(async () => ({ data: { user: null } })),
  getSession: vi.fn(async () => ({ data: { session: null } })),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe() {} } } })),
  signInWithPassword: vi.fn(async () => ({ error: { message: 'Invalid login credentials' } })),
  signUp: vi.fn(async () => ({ error: null })),
  resetPasswordForEmail: vi.fn(async () => ({ error: { message: 'User not found' } })),
  signOut: vi.fn(async () => ({ error: null })),
  updateUser: vi.fn(async () => ({ error: null })),
  mfa: { listFactors: vi.fn(async () => ({ data: { totp: [] } })), getAuthenticatorAssuranceLevel: vi.fn(async () => ({ data: { currentLevel: 'aal1', nextLevel: 'aal1' } })) },
}
vi.mock('../src/auth/client', () => ({ authConfigured: true, supabase: () => ({ auth, from: vi.fn(), rpc: vi.fn() }) }))

const { AuthProvider, GENERIC_SIGNIN_ERROR } = await import('../src/auth/AuthProvider')
const { default: Account } = await import('../src/components/Account')

const ui = () => render(<AuthProvider><Account onBack={() => {}} onPrivacy={() => {}} /></AuthProvider>)
const type = (label: RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })

beforeEach(() => vi.clearAllMocks())
afterEach(() => cleanup())

describe('sign in', () => {
  it('shows one generic message on failure (no account enumeration)', async () => {
    ui()
    await screen.findByRole('heading', { name: 'Welcome back' })
    type(/^Email/, 'someone@example.com'); type(/^Password/, 'wrong password here')
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText(GENERIC_SIGNIN_ERROR)).toBeTruthy()
    expect(screen.queryByText(/not found|no user|invalid login/i)).toBeNull()
  })
  it('pauses sign-in after repeated failures (brute-force protection)', async () => {
    ui()
    await screen.findByRole('heading', { name: 'Welcome back' })
    type(/^Email/, 'someone@example.com'); type(/^Password/, 'wrong password here')
    for (let i = 0; i < 5; i++) {
      fireEvent.click(screen.getByRole('button', { name: /Sign in|Signing in/ }))
      await waitFor(() => expect(auth.signInWithPassword).toHaveBeenCalledTimes(i + 1))
      await screen.findByText(GENERIC_SIGNIN_ERROR)
    }
    expect(await screen.findByRole('button', { name: /Try again in \d+ s/ })).toBeTruthy()
    expect((screen.getByRole('button', { name: /Try again in/ }) as HTMLButtonElement).disabled).toBe(true)
  })
  it('password fields support password managers and paste', async () => {
    ui()
    const pw = (await screen.findByLabelText(/^Password/)) as HTMLInputElement
    expect(pw.type).toBe('password')
    expect(pw.autocomplete).toBe('current-password')
    expect(pw.getAttribute('onpaste')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }))
    expect(pw.type).toBe('text')
  })
})

describe('create account', () => {
  it('requires the 13+ confirmation and a strong password', async () => {
    ui()
    fireEvent.click(await screen.findByRole('tab', { name: 'Create account' }))
    type(/^Email/, 'new@example.com'); type(/^Password/, 'fern lettuce compost wren')
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByText(/13 or older/, { selector: '[role=alert] *' })).toBeTruthy()
    expect(auth.signUp).not.toHaveBeenCalled()
    type(/^Password/, 'short')
    expect(screen.getByText(/at least 12 characters/i)).toBeTruthy()
  })
  it('the confirmation message is the same whether or not the email is registered', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('')))
    ui()
    fireEvent.click(await screen.findByRole('tab', { name: 'Create account' }))
    type(/^Email/, 'taken@example.com'); type(/^Password/, 'fern lettuce compost wren')
    fireEvent.click(screen.getByRole('checkbox'))
    auth.signUp.mockResolvedValueOnce({ error: { message: 'User already registered' } } as never)
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByText(/Check your email for a confirmation link/)).toBeTruthy()
    vi.unstubAllGlobals()
  })
})

describe('forgot password', () => {
  it('never reveals whether the email has an account', async () => {
    ui()
    fireEvent.click(await screen.findByRole('button', { name: 'Forgot password?' }))
    type(/^Email/, 'nobody@example.com')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Send reset link' })) })
    expect(await screen.findByText(/If an account uses that email/)).toBeTruthy()
  })
})

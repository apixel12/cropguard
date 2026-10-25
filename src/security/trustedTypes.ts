/**
 * Trusted Types default policy (DOM-XSS hardening; the CSP sends
 * `require-trusted-types-for 'script'; trusted-types default`).
 *
 * The app never writes HTML or script strings into the DOM, so the policy
 * allows exactly one thing: registering this origin's own service worker
 * (/sw.js). Any other HTML, script or script-URL sink throws, so an injected
 * string can never become running code.
 */
interface TTFactory {
  createPolicy(name: string, rules: { createScriptURL?: (s: string) => string }): unknown
}

export function scriptUrlAllowed(input: string, origin: string): string {
  const url = new URL(input, origin)
  if (url.origin === origin && url.pathname === '/sw.js') return url.href
  throw new TypeError(`Trusted Types: blocked script URL ${url.href}`)
}

export function installTrustedTypes(): boolean {
  const tt = (globalThis as { trustedTypes?: TTFactory }).trustedTypes
  if (!tt?.createPolicy) return false // browser without Trusted Types: CSP still applies
  try {
    tt.createPolicy('default', { createScriptURL: (s) => scriptUrlAllowed(s, location.origin) })
    return true
  } catch {
    return false // policy already exists (hot reload in dev)
  }
}

installTrustedTypes()

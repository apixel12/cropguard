import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { loadImage } from '../src/components/Capture'

describe('untrusted file input', () => {
  it('rejects files that are not images', async () => {
    await expect(loadImage(new Blob(['<svg onload=alert(1)>'], { type: 'text/html' }))).rejects.toThrow(/isn’t a photo/)
  })
  it('rejects oversized files before decoding (decompression bombs)', async () => {
    const big = { size: 61 * 1024 * 1024, type: 'image/png' } as Blob
    await expect(loadImage(big)).rejects.toThrow(/too large/)
  })
})

describe('security headers', () => {
  const h = JSON.parse(readFileSync('security-headers.json', 'utf8'))
  const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'))
  it('CSP forbids inline/eval scripts, framing, plugins and off-origin requests', () => {
    const csp: string = h['Content-Security-Policy']
    expect(csp).toMatch(/script-src 'self';/)
    expect(csp).not.toMatch(/unsafe-eval/)
    expect(csp).toMatch(/frame-ancestors 'none'/)
    expect(csp).toMatch(/object-src 'none'/)
    expect(csp).toMatch(/connect-src 'self'/) // photos cannot be sent anywhere
  })
  it('camera only for this origin; microphone and location off', () => {
    expect(h['Permissions-Policy']).toMatch(/camera=\(self\)/)
    expect(h['Permissions-Policy']).toMatch(/microphone=\(\)/)
    expect(h['Permissions-Policy']).toMatch(/geolocation=\(\)/)
  })
  it('production config ships exactly the tested headers', () => {
    const shipped = Object.fromEntries(vercel.headers[0].headers.map((x: { key: string; value: string }) => [x.key, x.value]))
    expect(shipped).toEqual(h)
  })
})

describe('hardened headers (OWASP Secure Headers / Mozilla Observatory)', () => {
  const h = JSON.parse(readFileSync('security-headers.json', 'utf8'))
  const csp: string = h['Content-Security-Policy']
  it('enforces Trusted Types and allows no inline styles', () => {
    expect(csp).toMatch(/require-trusted-types-for 'script'/)
    expect(csp).toMatch(/trusted-types default/)
    expect(csp).not.toMatch(/unsafe-inline/)
    expect(csp).toMatch(/base-uri 'none'/)
  })
  it('is cross-origin isolated', () => {
    expect(h['Cross-Origin-Opener-Policy']).toBe('same-origin')
    expect(h['Cross-Origin-Embedder-Policy']).toBe('require-corp')
    expect(h['Cross-Origin-Resource-Policy']).toBe('same-origin')
  })
  it('HSTS is two years and preload-ready; legacy XSS auditor disabled', () => {
    expect(h['Strict-Transport-Security']).toBe('max-age=63072000; includeSubDomains; preload')
    expect(h['X-XSS-Protection']).toBe('0')
  })
})

describe('Trusted Types policy', () => {
  it('only lets this origin register /sw.js', async () => {
    const { scriptUrlAllowed } = await import('../src/security/trustedTypes')
    const o = 'https://cropguard.example'
    expect(scriptUrlAllowed('/sw.js', o)).toBe(`${o}/sw.js`)
    expect(() => scriptUrlAllowed('https://evil.example/sw.js', o)).toThrow(/blocked/)
    expect(() => scriptUrlAllowed('/assets/x.js', o)).toThrow(/blocked/)
    expect(() => scriptUrlAllowed('data:text/javascript,alert(1)', o)).toThrow(/blocked/)
  })
})

describe('model integrity', () => {
  const body = new TextEncoder().encode('{"weights":1}')
  const sha = async (b: Uint8Array) => 'sha256-' + Buffer.from(await crypto.subtle.digest('SHA-256', b)).toString('base64')

  it('every shipped model file has a build-time hash', async () => {
    const { default: table } = await import('virtual:model-integrity')
    const files = Object.keys(table)
    for (const d of ['router-v2', 'lemon-v1', 'crops-v2']) {
      const dir = `public/models/${d}`
      if (!existsSync(dir)) continue
      for (const f of readdirSync(dir).filter((x) => /\.(json|bin)$/.test(x))) expect(files).toContain(`/models/${d}/${f}`)
    }
  })
  it('refuses files with no integrity record', async () => {
    const { expectedHash } = await import('../src/security/integrity')
    expect(() => expectedHash('/models/x/evil.bin', {})).toThrow(/no integrity record/)
  })
  it('accepts matching bytes and rejects tampered bytes', async () => {
    const { verifiedFetch } = await import('../src/security/integrity')
    const { default: table } = await import('virtual:model-integrity')
    const path = '/models/lemon-v1/metadata.json'
    const real = new Uint8Array(readFileSync(`public${path}`))
    expect(table[path]).toBe(await sha(real))
    const orig = globalThis.fetch
    try {
      globalThis.fetch = (async () => new Response(real)) as typeof fetch
      expect((await (await verifiedFetch(path)).arrayBuffer()).byteLength).toBe(real.byteLength)
      globalThis.fetch = (async () => new Response(body)) as typeof fetch
      await expect(verifiedFetch(path)).rejects.toThrow(/integrity check failed/)
    } finally {
      globalThis.fetch = orig
    }
  })
})

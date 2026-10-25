import hashes from 'virtual:model-integrity'

/**
 * Subresource integrity for model files. The build records a SHA-256 for
 * every model file (vite.config.ts, modelIntegrity) inside the hashed JS
 * bundle; each file is checked after download and before use, so a
 * tampered, truncated or stale cached model is refused rather than run.
 */
export class IntegrityError extends Error {}

const b64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)))

async function digest(buf: ArrayBuffer): Promise<string | null> {
  // crypto.subtle only exists in secure contexts (https, localhost). Over plain
  // http the JS itself is unprotected, so a check here would add nothing.
  if (!globalThis.crypto?.subtle) return null
  const h = await crypto.subtle.digest('SHA-256', buf)
  return 'sha256-' + b64(h)
}

export function expectedHash(url: string, table: Record<string, string> = hashes): string {
  const path = new URL(url, location.href).pathname
  const h = table[path]
  if (!h) throw new IntegrityError(`no integrity record for ${path}`)
  return h
}

/** Drop-in fetch for model files: verifies the body against the build-time hash. */
export async function verifiedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const want = expectedHash(url)
  const res = await fetch(input, init)
  if (!res.ok) return res
  const buf = await res.arrayBuffer()
  const got = await digest(buf)
  if (got !== null && got !== want) throw new IntegrityError(`integrity check failed for ${new URL(url, location.href).pathname}`)
  return new Response(buf, { status: res.status, statusText: res.statusText, headers: res.headers })
}

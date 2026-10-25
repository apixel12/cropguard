/** Development instrumentation: logs every fetch/XHR the page makes so offline
 * tests can prove inference needs no network. Enable with ?netlog=1 (persisted). */
export interface NetEntry {
  t: number
  kind: 'fetch' | 'xhr'
  url: string
  method: string
}

export const netLog: NetEntry[] = []

export function installNetworkGuard() {
  // Development instrumentation only: never shipped behaviour that a crafted
  // link (?netlog=1) could switch on in production.
  if (!import.meta.env.DEV) return false
  try {
    const qs = new URLSearchParams(location.search)
    if (qs.get('netlog') === '1') localStorage.setItem('cg-netlog', '1')
    if (qs.get('netlog') === '0') localStorage.removeItem('cg-netlog')
    if (localStorage.getItem('cg-netlog') !== '1') return false
  } catch {
    return false // storage blocked (private mode / disabled): never break startup
  }

  const origFetch = window.fetch.bind(window)
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
    netLog.push({ t: Date.now(), kind: 'fetch', url, method })
    console.info('[netlog] fetch', method, url)
    return origFetch(input, init)
  }
  const open = XMLHttpRequest.prototype.open
  XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
    netLog.push({ t: Date.now(), kind: 'xhr', url: String(url), method })
    console.info('[netlog] xhr', method, String(url))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (open as any).call(this, method, url, ...rest)
  } as typeof open
  return true
}

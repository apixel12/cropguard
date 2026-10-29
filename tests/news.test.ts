import { describe, expect, it } from 'vitest'
import { excerpt, FEEDS, merge, parseFeed, plainText, safeUrl, type Feed } from '../api/news'
import { mixSources } from '../src/components/News'

const feed: Feed = { source: 'Test', region: 'Global', topic: 'farming', url: 'https://example.org/feed' }
const NOW = Date.parse('2026-10-28T12:00:00Z')

const rss = (items: string) => `<?xml version="1.0"?><rss version="2.0"><channel><title>T</title>${items}</channel></rss>`

describe('news feeds', () => {
  it('reads RSS: plain-text title and short summary, newest first', () => {
    const xml = rss(`
      <item><title>Old &amp; wise</title><link>https://example.org/a</link><pubDate>Mon, 26 Oct 2026 10:00:00 GMT</pubDate><description>&lt;p&gt;First &lt;b&gt;story&lt;/b&gt;&lt;/p&gt;</description></item>
      <item><title><![CDATA[New <em>crop</em> news]]></title><link>https://example.org/b</link><pubDate>Tue, 27 Oct 2026 10:00:00 GMT</pubDate><description><![CDATA[<img src="x.jpg"> Rain helps <a href="#">maize</a>.]]></description></item>`)
    const items = parseFeed(xml, feed, NOW)
    expect(items.map((i) => i.title)).toEqual(['New crop news', 'Old & wise'])
    expect(items[0].summary).toBe('Rain helps maize.')
    expect(items[0]).toMatchObject({ source: 'Test', region: 'Global', topic: 'farming', url: 'https://example.org/b' })
  })

  it('keeps every recent story a feed lists, not just the newest few', () => {
    const items = Array.from({ length: 25 }, (_, k) => `<item><title>Story ${k}</title><link>https://example.org/${k}</link><pubDate>${new Date(NOW - k * 36e5).toUTCString()}</pubDate></item>`).join('')
    expect(parseFeed(rss(items), feed, NOW)).toHaveLength(25)
  })

  it('reads Atom and RDF feeds', () => {
    const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Atom story</title><link rel="alternate" href="https://example.org/atom"/><published>2026-10-27T08:00:00Z</published><summary>Hi</summary></entry></feed>`
    expect(parseFeed(atom, feed, NOW)[0]).toMatchObject({ title: 'Atom story', url: 'https://example.org/atom' })
    const rdf = `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dc="http://purl.org/dc/elements/1.1/"><item><title>Paper</title><link>https://example.org/p</link><dc:date>2026-10-27</dc:date></item></rdf:RDF>`
    expect(parseFeed(rdf, feed, NOW)[0]).toMatchObject({ title: 'Paper', url: 'https://example.org/p' })
  })

  it('drops unsafe links, undated, future-dated and stale stories', () => {
    const xml = rss(`
      <item><title>Script link</title><link>javascript:alert(1)</link><pubDate>Tue, 27 Oct 2026 10:00:00 GMT</pubDate></item>
      <item><title>No date</title><link>https://example.org/n</link></item>
      <item><title>Future</title><link>https://example.org/f</link><pubDate>Fri, 30 Oct 2026 10:00:00 GMT</pubDate></item>
      <item><title>Stale</title><link>https://example.org/s</link><pubDate>Mon, 01 Jun 2026 10:00:00 GMT</pubDate></item>`)
    expect(parseFeed(xml, feed, NOW)).toEqual([])
    expect(safeUrl('data:text/html,hi')).toBeNull()
    expect(safeUrl('https://example.org/x')).toBe('https://example.org/x')
  })

  it('strips scripts and decodes entities; excerpts stay short', () => {
    expect(plainText('<script>alert(1)</script>Soil &#8211; health &hellip;')).toBe('Soil – health …')
    const long = 'word '.repeat(100)
    expect(excerpt(long).length).toBeLessThanOrEqual(221)
    expect(excerpt(long).endsWith('…')).toBe(true)
  })

  it('merges feeds without duplicate links or headlines', () => {
    const a = { id: '1', title: 'Same story', url: 'https://a.org/1', summary: '', published: '2026-10-27T00:00:00.000Z', source: 'A', region: 'UK', topic: 'farming' as const }
    const b = { ...a, id: '2', url: 'https://b.org/2', source: 'B' }
    const c = { ...a, id: '3', title: 'Other', source: 'C' }
    expect(merge([[a], [b, c]]).map((i) => i.source)).toEqual(['A'])
  })

  it('mixes sources so one publisher does not fill the top of the list', () => {
    const mk = (source: string, h: number) => ({ id: source + h, title: source + h, url: `https://x.org/${source}${h}`, summary: '', published: new Date(NOW - h * 36e5).toISOString(), source, region: 'UK', topic: 'farming' as const })
    const out = mixSources([mk('A', 1), mk('A', 2), mk('A', 3), mk('B', 4), mk('C', 5)])
    expect(out.slice(0, 3).map((i) => i.source)).toEqual(['A', 'B', 'C'])
  })

  it('only fetches https feeds', () => {
    for (const f of FEEDS) expect(f.url.startsWith('https://')).toBe(true)
  })
})

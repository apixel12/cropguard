// GET /api/news: farming, gardening and plant-science headlines from public RSS/Atom
// feeds around the world, merged into one small JSON list. Runs on Vercel (and in
// `vite dev`/`vite preview` via the news-api plugin), so the app only ever talks to its
// own origin: the CSP's connect-src stays 'self'. Only headline, short summary, date
// and link are passed on; every story opens on the publisher's own site.
import { XMLParser } from 'fast-xml-parser'

export type Topic = 'farming' | 'gardening' | 'research'

export interface Feed { source: string; region: string; topic: Topic; url: string }

export interface NewsItem {
  id: string
  title: string
  url: string
  summary: string
  published: string // ISO date
  source: string
  region: string
  topic: Topic
}

export const FEEDS: Feed[] = [
  { source: 'FAO', region: 'Global', topic: 'farming', url: 'https://www.fao.org/feeds/fao-newsroom-rss' },
  { source: 'The Guardian', region: 'UK', topic: 'farming', url: 'https://www.theguardian.com/environment/farming/rss' },
  { source: 'Farm Progress', region: 'USA', topic: 'farming', url: 'https://www.farmprogress.com/rss.xml' },
  { source: 'Civil Eats', region: 'USA', topic: 'farming', url: 'https://civileats.com/feed/' },
  { source: "Farmer's Weekly", region: 'South Africa', topic: 'farming', url: 'https://www.farmersweekly.co.za/feed/' },
  { source: 'Agriland', region: 'Ireland', topic: 'farming', url: 'https://www.agriland.ie/feed/' },
  { source: 'The Hindu', region: 'India', topic: 'farming', url: 'https://www.thehindu.com/sci-tech/agriculture/feeder/default.rss' },
  { source: 'Mongabay', region: 'Global', topic: 'farming', url: 'https://news.mongabay.com/feed/?post_type=post&topic=agriculture' },
  { source: 'The Guardian', region: 'UK', topic: 'gardening', url: 'https://www.theguardian.com/lifeandstyle/gardens/rss' },
  { source: "Gardeners' World", region: 'UK', topic: 'gardening', url: 'https://www.gardenersworld.com/feed/' },
  { source: 'Gardening Know How', region: 'USA', topic: 'gardening', url: 'https://www.gardeningknowhow.com/feed' },
  { source: 'Phys.org', region: 'Global', topic: 'research', url: 'https://phys.org/rss-feed/biology-news/agriculture/' },
  { source: 'ScienceDaily', region: 'Global', topic: 'research', url: 'https://www.sciencedaily.com/rss/plants_animals/agriculture_and_food.xml' },
]

const PER_FEED = 8
const MAX_ITEMS = 120 // every feed keeps its PER_FEED stories, so busy feeds cannot crowd out gardening
const MAX_AGE_DAYS = 30
const MAX_FEED_BYTES = 3 * 1024 * 1024
const SUMMARY_CHARS = 220
const UA = 'CropGuard/1.0 (+https://cropguard-olive.vercel.app; plant-health app, headline reader)'

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', parseTagValue: false, trimValues: true, processEntities: true, htmlEntities: true })

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' }

/** Plain text from feed HTML: tags dropped, entities decoded, whitespace collapsed. */
export function plainText(v: unknown): string {
  let s = typeof v === 'string' ? v : v && typeof v === 'object' && '#text' in v ? String((v as Record<string, unknown>)['#text']) : ''
  s = s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]*>/g, ' ')
  s = s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ' '
    }
    return NAMED[e.toLowerCase()] ?? m
  })
  return s.replace(/\s+/g, ' ').trim()
}

/** Cut at a word boundary so summaries stay short excerpts, not copies of the article. */
export function excerpt(s: string, max = SUMMARY_CHARS): string {
  if (s.length <= max) return s
  const cut = s.slice(0, max)
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), max * 0.6)).replace(/[\s,;:.–—-]+$/, '') + '…'
}

/** Only absolute http(s) links reach the app. */
export function safeUrl(v: unknown): string | null {
  if (typeof v !== 'string') return null
  try {
    const u = new URL(v.trim())
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null
  } catch {
    return null
  }
}

const list = <T,>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v])

function atomLink(link: unknown): string | null {
  for (const l of list(link as Record<string, string> | Record<string, string>[])) {
    if (typeof l === 'string') return safeUrl(l)
    if (!l['@rel'] || l['@rel'] === 'alternate') return safeUrl(l['@href'])
  }
  return null
}

/** Parse one RSS 2.0 or Atom document into news items (newest first, at most PER_FEED). */
export function parseFeed(xml: string, feed: Feed, now = Date.now()): NewsItem[] {
  const doc = parser.parse(xml) as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
  const rss = list(doc?.rss?.channel?.item ?? doc?.['rdf:RDF']?.item)
  const atom = list(doc?.feed?.entry)
  const raw = rss.length
    ? rss.map((i) => ({ title: i.title, url: safeUrl(plainText(i.link) || i.guid?.['#text'] || i.guid), summary: i.description ?? i['content:encoded'], date: i.pubDate ?? i['dc:date'] }))
    : atom.map((e) => ({ title: e.title, url: atomLink(e.link), summary: e.summary ?? e.content, date: e.published ?? e.updated }))
  const out: NewsItem[] = []
  for (const r of raw) {
    const title = plainText(r.title)
    const time = Date.parse(plainText(r.date))
    if (!title || !r.url || !Number.isFinite(time)) continue
    if (time > now + 36e5 || now - time > MAX_AGE_DAYS * 864e5) continue // future-dated or stale
    let summary = excerpt(plainText(r.summary))
    if (summary.toLowerCase().startsWith(title.toLowerCase())) summary = '' // some feeds repeat the headline
    out.push({ id: r.url, title: excerpt(title, 200), url: r.url, summary, published: new Date(time).toISOString(), source: feed.source, region: feed.region, topic: feed.topic })
  }
  return out.sort((a, b) => b.published.localeCompare(a.published)).slice(0, PER_FEED)
}

/** Merge feeds: newest first, duplicates (same link or same headline) removed. */
export function merge(groups: NewsItem[][]): NewsItem[] {
  const seen = new Set<string>()
  const all = groups.flat().sort((a, b) => b.published.localeCompare(a.published))
  return all.filter((i) => {
    const key = i.title.toLowerCase().replace(/\W+/g, '')
    if (seen.has(i.url) || seen.has(key)) return false
    seen.add(i.url); seen.add(key)
    return true
  }).slice(0, MAX_ITEMS)
}

async function load(feed: Feed): Promise<NewsItem[]> {
  const r = await fetch(feed.url, { headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' }, signal: AbortSignal.timeout(6000), redirect: 'follow' })
  if (!r.ok) throw new Error(`${feed.source}: HTTP ${r.status}`)
  const text = await r.text()
  if (text.length > MAX_FEED_BYTES) throw new Error(`${feed.source}: feed too large`)
  return parseFeed(text, feed)
}

export async function GET(): Promise<Response> {
  const results = await Promise.allSettled(FEEDS.map(load))
  const ok = results.filter((r): r is PromiseFulfilledResult<NewsItem[]> => r.status === 'fulfilled').map((r) => r.value)
  const items = merge(ok)
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff' }
  if (!items.length) return new Response(JSON.stringify({ error: 'No news sources answered. Try again later.' }), { status: 502, headers: { ...headers, 'Cache-Control': 'no-store' } })
  return new Response(JSON.stringify({ updated: new Date().toISOString(), sources: ok.length, items }), {
    status: 200,
    // the CDN refreshes at most every 30 min, so feeds see a handful of requests a day
    headers: { ...headers, 'Cache-Control': 'public, max-age=300, s-maxage=1800, stale-while-revalidate=86400' },
  })
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowClockwise, ArrowUpRight, CloudSlash, Leaf, Newspaper, WarningCircle } from '@phosphor-icons/react'

type Topic = 'farming' | 'gardening' | 'research'
interface NewsItem { id: string; title: string; url: string; summary: string; published: string; source: string; region: string; topic: Topic }
interface NewsData { updated: string; items: NewsItem[] }

const REFRESH_MS = 5 * 60 * 1000 // matches the server's 5-minute cache
const PAGE = 30

const TOPICS: { id: Topic | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'farming', label: 'Farming' },
  { id: 'gardening', label: 'Gardening' },
  { id: 'research', label: 'Research' },
]

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
export function ago(iso: string, now = Date.now()): string {
  const s = (Date.parse(iso) - now) / 1000
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [['minute', 60], ['hour', 3600], ['day', 86400], ['week', 604800]]
  if (Math.abs(s) < 60) return 'just now'
  let unit: Intl.RelativeTimeFormatUnit = 'minute', size = 60
  for (const [u, n] of steps) if (Math.abs(s) >= n) { unit = u; size = n }
  return rtf.format(Math.round(s / size), unit)
}

/** Newest first, but no source twice in a row when another recent story is available. */
export function mixSources(items: NewsItem[]): NewsItem[] {
  const left = [...items], out: NewsItem[] = []
  while (left.length) {
    const prev = out.slice(-2).map((i) => i.source)
    const k = left.findIndex((i, n) => n < 6 && !prev.includes(i.source))
    out.push(left.splice(k < 0 ? 0 : k, 1)[0])
  }
  return out
}

/** Only what the app expects, from a response it doesn't control. */
function valid(j: unknown): NewsData | null {
  const d = j as NewsData
  if (!d || typeof d.updated !== 'string' || !Array.isArray(d.items)) return null
  const items = d.items.filter((i) => i && typeof i.title === 'string' && typeof i.url === 'string' && /^https?:\/\//.test(i.url) && typeof i.published === 'string')
  return { updated: d.updated, items }
}

function Story({ item, lead, fresh }: { item: NewsItem; lead?: boolean; fresh?: boolean }) {
  return (
    <a className={`story ${lead ? 'lead' : ''}`} href={item.url} target="_blank" rel="noopener noreferrer">
      <span className="story-meta">
        <span className={`topic-dot ${item.topic}`} aria-hidden />
        <b>{item.source}</b>
        <span>{item.region}</span>
        <span aria-hidden>·</span>
        <time dateTime={item.published}>{ago(item.published)}</time>
        {fresh && <span className="new-tag">New</span>}
      </span>
      <span className="story-title">{item.title}</span>
      {item.summary && <span className="story-sum">{item.summary}</span>}
      <span className="story-go"><span className="sr-only">Opens on {item.source}’s website</span><ArrowUpRight size={18} weight="bold" aria-hidden /></span>
    </a>
  )
}

export default function News() {
  const [data, setData] = useState<NewsData | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading')
  const [topic, setTopic] = useState<Topic | 'all'>('all')
  const [online, setOnline] = useState(navigator.onLine)
  const [fresh, setFresh] = useState<Set<string>>(new Set()) // stories that arrived since the last refresh
  const [shown, setShown] = useState(PAGE)
  const seen = useRef<Set<string> | null>(null)
  const lastLoad = useRef(0)

  const load = async () => {
    setState('loading')
    lastLoad.current = Date.now()
    try {
      const r = await fetch('/api/news', { headers: { Accept: 'application/json' }, cache: 'no-cache' })
      const d = r.ok ? valid(await r.json()) : null
      if (!d) throw new Error('bad response')
      const ids = d.items.map((i) => i.id)
      if (seen.current) setFresh(new Set(ids.filter((id) => !seen.current!.has(id))))
      seen.current = new Set([...(seen.current ?? []), ...ids])
      setData(d)
      setState('ok')
    } catch {
      setState('error')
    }
  }
  useEffect(() => { load() }, [])
  // Keep checking for new stories while News is open, and as soon as the app comes back to the foreground.
  useEffect(() => {
    const tick = () => { if (document.visibilityState === 'visible' && Date.now() - lastLoad.current >= REFRESH_MS - 1000) load() }
    const t = setInterval(tick, 60 * 1000)
    const vis = () => { if (document.visibilityState === 'visible' && Date.now() - lastLoad.current > 2 * 60 * 1000) load() }
    document.addEventListener('visibilitychange', vis)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis) }
  }, [])
  useEffect(() => setShown(PAGE), [topic])
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false)
    addEventListener('online', on); addEventListener('offline', off)
    return () => { removeEventListener('online', on); removeEventListener('offline', off) }
  }, [])

  const items = useMemo(() => mixSources((data?.items ?? []).filter((i) => topic === 'all' || i.topic === topic)), [data, topic])
  const sources = useMemo(() => new Set(data?.items.map((i) => i.source)).size, [data])
  const ti = TOPICS.findIndex((t) => t.id === topic)

  return (
    <section className="screen news">
      <div className="topbar">
        <span className="wordmark"><span className="mark"><Leaf size={20} weight="fill" aria-hidden /></span>CropGuard</span>
        <button className="icon-btn" onClick={load} disabled={state === 'loading'} aria-label="Refresh news">
          <ArrowClockwise size={22} className={state === 'loading' ? 'spin' : ''} aria-hidden />
        </button>
      </div>

      <div className="stack-sm">
        <h1>From fields and gardens</h1>
        <p className="lede">Farming, gardening and plant-science headlines from around the world. Stories open on the publisher’s site.</p>
      </div>

      <div className="topic-tabs" role="tablist" aria-label="Topic" style={{ ['--i' as string]: ti }}>
        <span className="thumb" aria-hidden />
        {TOPICS.map((t) => (
          <button key={t.id} role="tab" aria-selected={topic === t.id} aria-controls="stories" onClick={() => setTopic(t.id)}>{t.label}</button>
        ))}
      </div>

      {!online && data && (
        <div className="callout uncertain" role="status"><CloudSlash size={20} aria-hidden /><div><b>You’re offline.</b> These are the headlines saved {ago(data.updated)}.</div></div>
      )}

      {state === 'error' && !data && (
        <div className="empty" role="alert">
          <span className="icon-disc"><WarningCircle size={26} aria-hidden /></span>
          <div><b>Couldn’t load the news.</b> {online ? 'The news sources didn’t answer.' : 'You’re offline.'} Checking leaves still works without internet.</div>
          <button className="btn" onClick={load}>Try again</button>
        </div>
      )}

      {state === 'loading' && !data && (
        <div className="stories" aria-busy="true" aria-label="Loading news">
          {[0, 1, 2, 3].map((k) => <span key={k} className="story skeleton" aria-hidden><span /><span /><span /></span>)}
        </div>
      )}

      {data && (
        <>
          {fresh.size > 0 && (
            <p className="callout ok fresh-note" role="status">{fresh.size} new {fresh.size === 1 ? 'story' : 'stories'} since you last looked, marked New.</p>
          )}
          <div id="stories" className="stories stagger" key={topic} role="tabpanel">
            {items.length ? items.slice(0, shown).map((i, k) => <Story key={i.id} item={i} lead={k === 0} fresh={fresh.has(i.id)} />) : <p className="caption">No recent stories in this topic.</p>}
          </div>
          {items.length > shown && (
            <button className="btn full" onClick={() => setShown(shown + PAGE)}>Show more stories ({items.length - shown} more)</button>
          )}
          <p className="fine-print news-foot">
            <Newspaper size={16} aria-hidden /> {data.items.length} stories from the last two weeks, {sources} publishers · updated {ago(data.updated)}, checks for new ones every few minutes. Headlines and short excerpts belong to their publishers; CropGuard doesn’t check or endorse them.
          </p>
        </>
      )}
    </section>
  )
}

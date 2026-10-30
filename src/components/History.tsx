import { ArrowLeft, ClockCounterClockwise, Trash } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { listScans, type ScanRecord } from '../db/history'
import { removeAllScans, removeScan } from '../sync/historySync'

function Thumb({ blob }: { blob?: Blob }) {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    if (!blob) return // synced from another device: photos never leave the phone they were taken on
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])
  return url ? <img className="thumb" src={url} alt="" /> : <span className="thumb" />
}

const PAGE = 50

const when = (t: number) =>
  new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

/** How a saved result reads at a glance. */
export type Tone = 'healthy' | 'attention' | 'minor'

const TONE: Record<Tone, { text: string; cls: string }> = {
  healthy: { text: 'Healthy', cls: 'healthy' },
  attention: { text: 'Needs care', cls: 'attention' },
  minor: { text: 'Minor', cls: '' },
}

interface RowProps {
  s: ScanRecord
  displayName: (crop: string, label: string) => string
  tone?: (crop: string, label: string) => Tone
  onDelete?: (id: string) => void
}

export function ScanRow({ s, displayName, tone, onDelete }: RowProps) {
  const uncertain = s.status === 'uncertain'
  const name = uncertain ? 'Not sure' : displayName(s.crop, s.prediction)
  const t = !uncertain && tone ? tone(s.crop, s.prediction) : null
  const badge = t && !(t === 'healthy' && /healthy/i.test(name)) ? TONE[t] : null // the name already says it
  return (
    <div className="list-row">
      <Thumb blob={s.thumbnail} />
      <span className="grow">
        <span className="title">{name}</span>
        <span className="sub">
          {s.crop} · {when(s.timestamp)}
        </span>
      </span>
      {badge && <span className={`badge ${badge.cls}`}>{badge.text}</span>}
      {onDelete && (
        <button className="icon-btn" aria-label={`Delete ${name} from ${when(s.timestamp)}`} onClick={() => onDelete(s.id)}>
          <Trash size={20} aria-hidden />
        </button>
      )}
    </div>
  )
}

export default function History({ onBack, displayName, tone }: { onBack: () => void; displayName: RowProps['displayName']; tone?: RowProps['tone'] }) {
  const [scans, setScans] = useState<ScanRecord[] | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [shown, setShown] = useState(PAGE) // long histories render in pages; each row makes a thumbnail URL
  const refresh = () => listScans().then(setScans).catch(() => setScans([]))
  useEffect(() => { refresh() }, [])

  return (
    <section className="screen">
      <div className="topbar">
        <button className="icon-btn back" onClick={onBack}><ArrowLeft size={20} aria-hidden />Back</button>
      </div>
      <div style={{ display: 'grid', gap: 'var(--s2)' }}>
        <h1>History</h1>
        <p className="lede">Saved only on this phone, never uploaded. Delete any check, or all of them, whenever you like.</p>
      </div>
      {scans === null && <p className="status wait"><span className="spinner" aria-hidden />Loading…</p>}
      {scans?.length === 0 && (
        <div className="empty">
          <span className="icon-disc"><ClockCounterClockwise size={26} aria-hidden /></span>
          <div><b>No checks yet.</b> When you check a leaf, the result is kept here so you can compare over time.</div>
        </div>
      )}
      {!!scans?.length && (
        <div className="list-card stagger">
          {scans.slice(0, shown).map((s) => (
            <ScanRow key={s.id} s={s} displayName={displayName} tone={tone} onDelete={(id) => removeScan(id).then(refresh)} />
          ))}
        </div>
      )}
      {!!scans && scans.length > shown && (
        <button className="btn full" onClick={() => setShown(shown + PAGE)}>Show older checks ({scans.length - shown} more)</button>
      )}
      {!!scans?.length && (confirming ? (
        <div className="callout attention" role="alertdialog" aria-label="Delete all history">
          <div>
            <b>Delete all {scans.length} checks?</b> This can’t be undone.
            <div className="row-actions" style={{ marginTop: 'var(--s3)' }}>
              <button className="btn" onClick={() => setConfirming(false)}>Cancel</button>
              <button className="btn danger" onClick={() => removeAllScans().then(() => { setConfirming(false); refresh() })}>Delete all</button>
            </div>
          </div>
        </div>
      ) : (
        <button className="text-link danger" onClick={() => setConfirming(true)}>Delete all history</button>
      ))}
    </section>
  )
}

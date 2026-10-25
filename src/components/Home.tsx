import { Camera, CheckCircle, ClockCounterClockwise, CloudArrowDown, Leaf, WarningCircle } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { listScans, type ScanRecord } from '../db/history'
import { useModels } from '../hooks/useModels'
import type { ModelId } from '../ml/modelRegistry'
import { PV_CROPS } from '../ml/plantVillageClassifier'
import { ScanRow } from './History'
import { ModeSwitch } from '../hooks/useMode'

interface Props {
  onScan: () => void
  onHistory: () => void
  onAbout: () => void
  online: boolean
  offlineReady: boolean
  displayName: (crop: string, label: string) => string
}

const IDS: ModelId[] = ['router-v2', 'lemon-v1', 'crops-v2']
const PLANTS = ['Lemon', ...PV_CROPS.map((c) => c.name.toLowerCase())]

export default function Home({ onScan, onHistory, onAbout, online, offlineReady, displayName }: Props) {
  const { state, retry } = useModels()
  const ready = IDS.every((id) => state[id].status === 'ready')
  const failed = IDS.filter((id) => state[id].status === 'error')
  const [recent, setRecent] = useState<ScanRecord[]>([])
  useEffect(() => { listScans().then((s) => setRecent(s.slice(0, 3))).catch(() => {}) }, [])

  const status = failed.length
    ? { cls: 'bad', icon: <WarningCircle size={18} aria-hidden />, text: 'Part of CropGuard couldn’t load' }
    : ready && offlineReady
      ? { cls: 'ok', icon: <CheckCircle size={18} weight="fill" aria-hidden />, text: online ? 'Ready, and works offline' : 'Offline. Everything still works' }
      : ready
        ? { cls: 'wait', icon: <CloudArrowDown size={18} aria-hidden />, text: 'Ready. Saving for offline use…' }
        : { cls: 'wait', icon: <span className="spinner" aria-hidden />, text: 'Getting ready…' }

  return (
    <section className="screen">
      <div className="topbar">
        <span className="wordmark"><Leaf size={24} weight="fill" aria-hidden />CropGuard</span>
        <button className="icon-btn" onClick={onHistory}><ClockCounterClockwise size={20} aria-hidden />History</button>
      </div>

      <div style={{ display: 'grid', gap: 'var(--s3)' }}>
        <h1>Is something wrong with your plant?</h1>
        <p className="lede">Take a photo or short video of one leaf. CropGuard works out which plant it is and checks it for common problems, right here on your phone.</p>
        <ModeSwitch />
      </div>

      <div style={{ display: 'grid', gap: 'var(--s3)' }}>
        <button className="btn primary full big" onClick={onScan} disabled={!ready}>
          <Camera size={24} aria-hidden />Check a leaf
        </button>
        <p className={`status ${status.cls}`} aria-live="polite">{status.icon}{status.text}</p>
      </div>

      {failed.length > 0 && (
        <div className="callout attention" role="alert">
          <WarningCircle size={20} aria-hidden />
          <div>
            <b>Some of CropGuard didn’t download.</b> Connect to the internet once, or check your phone has free storage.
            <button className="btn" onClick={() => failed.forEach(retry)}>Try again</button>
          </div>
        </div>
      )}

      {recent.length > 0 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <h2 className="section-title">Recent checks</h2>
            <button className="text-link" onClick={onHistory}>See all</button>
          </div>
          <div className="list-card">
            {recent.map((s) => <ScanRow key={s.id} s={s} displayName={displayName} />)}
          </div>
        </div>
      )}

      <div className="panel">
        <section>
          <h3>Works with</h3>
          <p>{PLANTS.slice(0, -1).join(', ')} and {PLANTS[PLANTS.length - 1]}.</p>
        </section>
      </div>

      <div>
        <button className="text-link" onClick={onAbout}>How CropGuard works</button>
        <p className="fine-print">A screening aid, not a diagnosis. Confirm anything serious with your local extension office or a garden centre.</p>
      </div>
    </section>
  )
}

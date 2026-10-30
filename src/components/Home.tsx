import { ArrowsClockwise, Camera, CheckCircle, ClockCounterClockwise, CloudArrowDown, Leaf, WarningCircle } from '@phosphor-icons/react'
import { authConfigured } from '../auth/client'
import { useEffect, useState } from 'react'
import { recentScans, type ScanRecord } from '../db/history'
import { useModels } from '../hooks/useModels'
import type { ModelId } from '../ml/modelRegistry'
import { ScanRow, type Tone } from './History'
import PlantShow from './PlantShow'
import { ModeSwitch } from '../hooks/useMode'
import { useAppUpdate } from '../utils/appUpdate'

interface Props {
  onScan: () => void
  onHistory: () => void
  onAbout: () => void
  onAccount: () => void
  online: boolean
  offlineReady: boolean
  displayName: (crop: string, label: string) => string
  tone?: (crop: string, label: string) => Tone
  /** Email of the signed-in user, if any. */
  signedIn?: string | null
}

const IDS: ModelId[] = ['router-v2', 'lemon-v1', 'crops-v2']

/** A big leaf, drawn in once behind the headline. */
function HeroArt() {
  return (
    <svg className="hero-art" viewBox="0 0 200 200" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
      <path pathLength={1} d="M28 172C26 92 86 30 182 24C178 116 116 172 28 172Z" />
      <path pathLength={1} d="M28 172C78 124 122 80 166 40" />
      <path pathLength={1} d="M62 139C56 122 54 108 56 94M62 139C80 144 96 144 110 140" />
      <path pathLength={1} d="M92 110C88 94 88 80 92 66M92 110C110 116 126 116 140 110" />
      <path pathLength={1} d="M122 82C122 68 124 56 130 46M122 82C138 88 150 88 160 82" />
    </svg>
  )
}

export default function Home({ onScan, onHistory, onAbout, onAccount, online, offlineReady, displayName, tone, signedIn }: Props) {
  const { state, retry } = useModels()
  const update = useAppUpdate()
  const ready = IDS.every((id) => state[id].status === 'ready')
  const failed = IDS.filter((id) => state[id].status === 'error')
  const [recent, setRecent] = useState<ScanRecord[]>([])
  useEffect(() => { recentScans(3).then(setRecent).catch(() => {}) }, [])

  const status = failed.length
    ? { cls: 'bad', icon: <WarningCircle size={16} weight="fill" aria-hidden />, text: 'Part of CropGuard couldn’t load' }
    : ready && offlineReady
      ? { cls: 'ok', icon: <CheckCircle size={16} weight="fill" aria-hidden />, text: online ? 'Ready, and works offline' : 'Offline. Everything still works' }
      : ready
        ? { cls: 'wait', icon: <CloudArrowDown size={16} aria-hidden />, text: 'Ready. Saving for offline use…' }
        : { cls: 'wait', icon: <span className="spinner" aria-hidden />, text: 'Getting ready…' }

  return (
    <section className="screen">
      <div className="topbar">
        <span className="wordmark"><span className="mark"><Leaf size={20} weight="fill" aria-hidden /></span>CropGuard</span>
        <span className="top-actions">
          <button className="icon-btn" onClick={onHistory}><ClockCounterClockwise size={22} aria-hidden /><span className="label">History</span></button>
          {authConfigured && (signedIn
            ? <button className="icon-btn account-btn" onClick={onAccount} aria-label="Account"><span className="avatar" aria-hidden>{signedIn.charAt(0)}</span></button>
            : <button className="chip-btn" onClick={onAccount}>Sign in</button>)}
        </span>
      </div>

      {update && (
        <div className="callout ok" role="status">
          <ArrowsClockwise size={20} weight="bold" aria-hidden />
          <div>
            <b>A new version of CropGuard is ready.</b> It takes a few seconds and keeps your history.
            <button className="btn primary" onClick={update}>Update now</button>
          </div>
        </div>
      )}

      <div className="hero">
        <HeroArt />
        <p className={`status-chip ${status.cls}`} aria-live="polite">{status.icon}{status.text}</p>
        <h1>Is something wrong with your plant?</h1>
        <p className="hero-lede">Take a photo or short video of one leaf. CropGuard works out which plant it is and checks it for common problems, right here on your phone.</p>
        <button className="btn cta full big" onClick={onScan} disabled={!ready}>
          <Camera size={24} weight="duotone" aria-hidden />Check a leaf
        </button>
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

      <div className="stack-sm">
        <h2 className="section-title">How much detail?</h2>
        <ModeSwitch />
      </div>

      {recent.length > 0 && (
        <div>
          <div className="section-head">
            <h2 className="section-title">Recent checks</h2>
            <button className="text-link" onClick={onHistory}>See all</button>
          </div>
          <div className="list-card stagger">
            {recent.map((s) => <ScanRow key={s.id} s={s} displayName={displayName} tone={tone} />)}
          </div>
        </div>
      )}

      <div className="stack-sm">
        <h2 className="section-title">Works with</h2>
        <PlantShow onCredits={onAbout} />
      </div>

      <div>
        <button className="text-link" onClick={onAbout}>How CropGuard works</button>
        <p className="fine-print">A screening aid, not a diagnosis. Confirm anything serious with your local extension office or a garden centre.</p>
      </div>
    </section>
  )
}

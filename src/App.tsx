import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Check } from '@phosphor-icons/react'
import About from './components/About'
import Account from './components/Account'
import Privacy from './components/Privacy'
import { useAuth } from './auth/AuthProvider'
import { pushScan, syncNow } from './sync/historySync'
import Capture, { type Captured } from './components/Capture'
import { chooseFrames, type Source } from './ml/frames'
import ChoosePlant from './components/ChoosePlant'
import History from './components/History'
import Home from './components/Home'
import type { Tone } from './components/History'
import Result, { type Input, type Outcome } from './components/Result'
import { lemonInfo } from './data/lemonDiseases'
import { plantVillageInfo } from './data/plantVillageDiseases'
import { makeThumbnail, saveScan } from './db/history'
import { useModels } from './hooks/useModels'
import { classifyLemon } from './ml/lemonClassifier'
import { classifyPlantVillage, cropOf, PV_CROPS } from './ml/plantVillageClassifier'
import { checkQuality } from './ml/qualityGate'
import { identifyPlant, plantName, type Plant } from './ml/router'
import { allModelsCached } from './utils/offlineCheck'

type Screen =
  | { s: 'home' }
  | { s: 'capture' }
  | { s: 'processing'; photo: string; step: string; stage: 0 | 1 | 2 }
  | { s: 'choose'; photo: string; suggestions: Plant[]; reason: 'unsure' | 'change' }
  | { s: 'result'; photo: string; plant: Plant | null; suggestions: Plant[]; outcome: Outcome }
  | { s: 'history' }
  | { s: 'about' }
  | { s: 'account' }
  | { s: 'privacy'; from: 'account' | 'home' }

const pvName = (label: string) => {
  const info = plantVillageInfo(label)
  if (!info) return label.replace(/_+/g, ' ')
  const crop = PV_CROPS.find((c) => c.key === cropOf(label))?.name ?? info.crop
  return `${crop}: ${info.name}`
}
const lemonName = (label: string) => lemonInfo(label)?.name ?? label
const historyName = (crop: string, label: string) => (crop === 'Lemon' ? lemonName(label) : pvName(label))
const historyTone = (crop: string, label: string): Tone => {
  const sev = (crop === 'Lemon' ? lemonInfo(label) : plantVillageInfo(label))?.severity
  return sev === 'none' ? 'healthy' : sev === 'low' || !sev ? 'minor' : 'attention'
}
const STAGES = ['Check the photo', 'Identify the plant', 'Look for problems']
// how deep each screen sits, so screen changes slide forward or back
const DEPTH: Record<Screen['s'], number> = { home: 0, capture: 1, history: 1, about: 1, account: 1, processing: 2, choose: 2, privacy: 2, result: 3 }
const prefersReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches
const paint = () => new Promise((r) => setTimeout(r, 30)) // let the progress text render

export default function App() {
  const { models, state } = useModels()
  const auth = useAuth()
  const [screen, setScreenNow] = useState<Screen>({ s: 'home' })
  // the screen being shown or about to be (a view transition applies it a frame later)
  const want = useRef<Screen>(screen)
  const setScreen = (next: Screen) => {
    const from = want.current.s
    want.current = next
    if (from === next.s || !document.startViewTransition || prefersReducedMotion()) return setScreenNow(next)
    document.documentElement.dataset.nav = DEPTH[next.s] >= DEPTH[from] ? 'forward' : 'back'
    document.startViewTransition(() => flushSync(() => setScreenNow(want.current)))
  }
  const [online, setOnline] = useState(navigator.onLine)
  const [offlineReady, setOfflineReady] = useState(false)
  // what is being checked: the frames analysed + a still for thumbnails (kept for "Change plant")
  const img = useRef<{ frames: Source[]; still: Source; softBlur: boolean; input: Input } | null>(null)

  // Release the full-resolution photo once no screen shows it any more.
  const lastPhoto = useRef<string | null>(null)
  useEffect(() => {
    const photo = 'photo' in screen ? screen.photo : null
    if (lastPhoto.current && lastPhoto.current !== photo) URL.revokeObjectURL(lastPhoto.current)
    lastPhoto.current = photo
    if (!photo) img.current = null
  }, [screen])

  // Signed in (and two-factor verified, if enabled): sync history in the background.
  useEffect(() => { if (auth.status === 'signed-in') syncNow().catch(() => {}) }, [auth.status])
  // Opened from a password-reset email: go straight to "choose a new password".
  useEffect(() => { if (auth.recovery) setScreen({ s: 'account' }) }, [auth.recovery])

  // Each new screen starts at the top.
  useEffect(() => { window.scrollTo(0, 0) }, [screen.s])

  // Phone back button / back swipe: return to Home instead of leaving the app.
  useEffect(() => {
    if (screen.s !== 'home' && history.state?.cg !== true) history.pushState({ cg: true }, '')
    if (screen.s === 'home' && history.state?.cg === true) history.back()
  }, [screen.s])
  useEffect(() => {
    const onPop = () => { if (want.current.s !== 'processing') setScreen({ s: 'home' }) }
    addEventListener('popstate', onPop)
    return () => removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false)
    addEventListener('online', on)
    addEventListener('offline', off)
    return () => { removeEventListener('online', on); removeEventListener('offline', off) }
  }, [])

  const allReady = (['router-v2', 'lemon-v1', 'crops-v2'] as const).every((id) => state[id].status === 'ready')
  // poll the cache until the service worker has stored every model shard
  useEffect(() => {
    if (!allReady) return
    let stop = false
    const tick = async () => {
      const ok = await allModelsCached().catch(() => false)
      if (stop) return
      setOfflineReady(ok)
      if (!ok) setTimeout(tick, 1500)
    }
    tick()
    return () => { stop = true }
  }, [allReady])

  /** Run the disease model for a known plant, save, show the result. */
  const check = async (photo: string, plant: Plant, suggestions: Plant[]) => {
    const image = img.current
    if (!image) return setScreen({ s: 'home' })
    setScreen({ s: 'processing', photo, step: `Checking the ${plantName(plant).toLowerCase()} leaf…`, stage: 2 })
    await paint()
    let outcome: Outcome
    try {
      if (plant.kind === 'lemon') {
        const m = models['lemon-v1']
        if (!m) throw new Error('The lemon model isn’t loaded.')
        const pred = await classifyLemon(m, image.frames, image.input.combine)
        outcome = { kind: 'prediction', pred, info: lemonInfo(pred.top[0].label), cropName: 'Lemon', threshold: pred.cutoff }
      } else {
        const m = models['crops-v2']
        if (!m) throw new Error('The garden model isn’t loaded.')
        const pred = await classifyPlantVillage(m, image.frames, plant.cropKey, image.input.combine)
        outcome = { kind: 'prediction', pred, info: plantVillageInfo(pred.top[0].label), cropMismatch: pred.cropMismatch, cropName: plant.cropName, threshold: pred.cutoff }
      }
      outcome.softBlur = image.softBlur
      outcome.input = image.input
      const p = outcome.pred
      // a storage failure must not turn a valid result into an error
      try {
        const saved = await saveScan({
          crop: outcome.cropName,
          modelVersion: p.modelVersion,
          prediction: p.status === 'confident' ? p.top[0].label : 'Uncertain',
          status: p.status,
          confidence: p.top[0].confidence,
          thumbnail: await makeThumbnail(image.still),
        })
        outcome.saved = true
        void pushScan(saved) // signed-in users: back up the result (never the photo)
      } catch (e) {
        console.warn('[cropguard] history save failed', e)
        outcome.saved = false
      }
    } catch (e) {
      outcome = { kind: 'error', message: e instanceof Error ? e.message : String(e) }
    }
    setScreen({ s: 'result', photo, plant, suggestions, outcome })
  }

  /** New photo or video: quality check → identify the plant → check, or ask which plant. */
  const analyze = async (c: Captured) => {
    const first = c.kind === 'photos' ? c.imgs[0] : c.preview
    setScreen({ s: 'processing', photo: first.src, step: c.kind === 'video' ? 'Picking the sharpest frames…' : c.imgs.length > 1 ? `Looking at ${c.imgs.length} photos…` : 'Looking at the photo…', stage: 0 })
    await paint()
    try {
      let image: NonNullable<typeof img.current>
      if (c.kind === 'video') {
        // keep only frames that pass the quality gate, sharpest first
        const choice = chooseFrames(c.frames)
        if (!choice.best.length) return setScreen({ s: 'result', photo: first.src, plant: null, suggestions: [], outcome: { kind: 'quality', report: choice.report } })
        image = { frames: choice.best, still: c.preview, softBlur: choice.report.softBlur, input: { kind: 'video', used: choice.best.length, skipped: 0, srcs: [c.preview.src], combine: 'mean' } }
      } else {
        // every photo is checked; unusable ones are skipped, the rest combined
        const rated = c.imgs.map((im) => ({ im, q: checkQuality(im) }))
        const ok = rated.filter((r) => r.q.ok)
        if (!ok.length) return setScreen({ s: 'result', photo: first.src, plant: null, suggestions: [], outcome: { kind: 'quality', report: rated[0].q } })
        image = {
          frames: ok.map((r) => r.im), still: ok[0].im, softBlur: ok.some((r) => r.q.softBlur),
          input: { kind: 'photos', used: ok.length, skipped: rated.length - ok.length, srcs: ok.map((r) => r.im.src), combine: 'geometric' },
        }
      }
      const photo = image.input.srcs[0]
      img.current = image
      const router = models['router-v2']
      if (!router) return setScreen({ s: 'choose', photo, suggestions: [], reason: 'unsure' })
      setScreen({ s: 'processing', photo, step: 'Working out which plant this is…', stage: 1 })
      await paint()
      const id = await identifyPlant(router, image.frames, image.input.combine)
      if (id.plant) await check(photo, id.plant, id.suggestions)
      else setScreen({ s: 'choose', photo, suggestions: id.suggestions, reason: 'unsure' })
    } catch (e) {
      setScreen({ s: 'result', photo: first.src, plant: null, suggestions: [], outcome: { kind: 'error', message: e instanceof Error ? e.message : String(e) } })
    }
  }

  switch (screen.s) {
    case 'home':
      return (
        <Home
          online={online}
          offlineReady={offlineReady}
          onScan={() => setScreen({ s: 'capture' })}
          onHistory={() => setScreen({ s: 'history' })}
          onAbout={() => setScreen({ s: 'about' })}
          onAccount={() => setScreen({ s: 'account' })}
          displayName={historyName}
          tone={historyTone}
          signedIn={auth.status === 'signed-in' ? auth.user?.email ?? '' : null}
        />
      )
    case 'capture':
      return <Capture onBack={() => setScreen({ s: 'home' })} onAnalyze={analyze} />
    case 'processing':
      return (
        <section className="screen analysing">
          <div className="topbar" />
          <div className="scan"><img src={screen.photo} alt="" /></div>
          <div className="stack">
            <h1>Checking your leaf</h1>
            <p className="status wait" aria-live="polite"><span className="spinner" aria-hidden /><span key={screen.step} className="step-text">{screen.step}</span></p>
          </div>
          <ol className="steps-list" aria-label="Progress">
            {STAGES.map((t, i) => (
              <li key={t} className={i < screen.stage ? 'done' : i === screen.stage ? 'now' : ''} aria-current={i === screen.stage ? 'step' : undefined}>
                <span className="dot">{i < screen.stage ? <Check size={14} weight="bold" aria-hidden /> : null}</span>{t}
              </li>
            ))}
          </ol>
        </section>
      )
    case 'choose':
      return (
        <ChoosePlant
          photo={screen.photo}
          suggestions={screen.suggestions}
          reason={screen.reason}
          onPick={(p) => check(screen.photo, p, screen.suggestions)}
          onBack={() => setScreen({ s: 'home' })}
        />
      )
    case 'result':
      return (
        <Result
          photo={screen.photo}
          outcome={screen.outcome}
          plant={screen.plant}
          displayName={screen.plant?.kind === 'lemon' ? lemonName : pvName}
          onChangePlant={screen.plant ? () => setScreen({ s: 'choose', photo: screen.photo, suggestions: screen.suggestions, reason: 'change' }) : undefined}
          onHome={() => setScreen({ s: 'home' })}
          onRetake={() => setScreen({ s: 'capture' })}
        />
      )
    case 'about':
      return <About onBack={() => setScreen({ s: 'home' })} />
    case 'account':
      return <Account onBack={() => setScreen({ s: 'home' })} onPrivacy={() => setScreen({ s: 'privacy', from: 'account' })} />
    case 'privacy':
      return <Privacy onBack={() => setScreen(screen.from === 'account' ? { s: 'account' } : { s: 'home' })} />
    case 'history':
      return <History onBack={() => setScreen({ s: 'home' })} displayName={historyName} tone={historyTone} />
  }
}

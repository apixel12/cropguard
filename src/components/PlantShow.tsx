import { useEffect, useMemo, useState } from 'react'
import { CaretLeft, CaretRight, Pause, Play } from '@phosphor-icons/react'
import { PLANT_PHOTOS } from '../data/plantPhotos'

const EVERY_MS = 3200
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** Fisher–Yates: a new random order each time Home opens. */
function shuffled<T>(xs: T[]): T[] {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Slideshow of the plants CropGuard knows, in random order. Pausable; never moves under reduced motion. */
export default function PlantShow({ onCredits }: { onCredits: () => void }) {
  const order = useMemo(() => shuffled(PLANT_PHOTOS), [])
  const [i, setI] = useState(0)
  const [playing, setPlaying] = useState(() => !reducedMotion())
  const n = order.length
  const go = (d: number) => setI((x) => (x + d + n) % n)

  useEffect(() => {
    if (!playing) return
    const t = setInterval(() => { if (!document.hidden) setI((x) => (x + 1) % n) }, EVERY_MS)
    return () => clearInterval(t)
  }, [playing, n])

  return (
    <div className="plant-show">
      <div className="frames" aria-hidden>
        {order.map((p, k) => {
          // only the current photo and its neighbours are loaded
          const near = k === i || k === (i + 1) % n || k === (i - 1 + n) % n
          return near ? <img key={p.name} src={p.src} alt="" className={k === i ? 'on' : ''} decoding="async" /> : null
        })}
        <span key={order[i].name} className="plant-name">{order[i].name}</span>
      </div>
      <p className="sr-only">CropGuard works with {order.map((p) => p.name).sort().join(', ')}.</p>
      <div className="show-bar">
        <span className="caption">{n} plants · <button className="text-link inline" onClick={onCredits}>Photo credits</button></span>
        <span className="show-controls">
          <button className="icon-btn" onClick={() => go(-1)} aria-label="Previous plant"><CaretLeft size={18} weight="bold" aria-hidden /></button>
          <button className="icon-btn" onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause slideshow' : 'Play slideshow'} aria-pressed={!playing}>
            {playing ? <Pause size={18} weight="fill" aria-hidden /> : <Play size={18} weight="fill" aria-hidden />}
          </button>
          <button className="icon-btn" onClick={() => go(1)} aria-label="Next plant"><CaretRight size={18} weight="bold" aria-hidden /></button>
        </span>
      </div>
    </div>
  )
}

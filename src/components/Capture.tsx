import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { ArrowClockwise, ArrowLeft, CornersOut, ImageSquare, Images, Plus, Sun, VideoCamera, X } from '@phosphor-icons/react'
import { chooseFrames, framesFromStream, framesFromVideoFile, type Source } from '../ml/frames'

/** What the user captured: one or more photos of the same plant, or frames sampled from a video. */
export type Captured = { kind: 'photos'; imgs: HTMLImageElement[] } | { kind: 'video'; frames: Source[]; preview: HTMLImageElement }

/** Up to this many photos per check. Combining 3 different photos of the same plant took
 * crops test accuracy from 89% to 97% (README, "More than one photo"). */
export const MAX_PHOTOS = 5
const isVideoFile = (f: File) => f.type.startsWith('video/') || (!f.type && /\.(mp4|m4v|mov|webm|3gp|mkv)$/i.test(f.name))

/** How to get a reliable check with today's options: several photos, a short video, or the library. */
const tips = (camera: boolean) => [
  { icon: <Sun size={20} aria-hidden />, text: 'Daylight, out of harsh sun' },
  { icon: <CornersOut size={20} aria-hidden />, text: 'One leaf filling the square, held still' },
  { icon: <Images size={20} aria-hidden />, text: `Most reliable: 2 or 3 photos of the same plant, or ${camera ? 'tap Video for a 3-second clip' : 'a short video'}` },
  ...(camera ? [{ icon: <ImageSquare size={20} aria-hidden />, text: 'Already have photos or a video? Use Library' }] : []),
]

interface Props {
  onBack: () => void
  onAnalyze: (c: Captured) => void
}

/** A still to show for a video: the sharpest sampled frame. */
async function previewOf(frames: HTMLCanvasElement[]): Promise<HTMLImageElement> {
  const best = chooseFrames(frames, 1).best[0] ?? frames[0]
  const blob = await new Promise<Blob>((res, rej) => (best as HTMLCanvasElement).toBlob((b) => (b ? res(b) : rej(new Error('preview failed'))), 'image/jpeg', 0.9))
  return loadImage(blob)
}

/** Larger than any phone camera (200 MP); guards against decompression-bomb files. */
export const MAX_IMAGE_PIXELS = 200_000_000
const MAX_FILE_BYTES = 60 * 1024 * 1024

export function loadImage(blob: Blob): Promise<HTMLImageElement> {
  if (blob.size > MAX_FILE_BYTES) return Promise.reject(new Error('That file is too large. Choose a normal photo.'))
  if (blob.type && !blob.type.startsWith('image/')) return Promise.reject(new Error('That file isn’t a photo.'))
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      // browsers apply EXIF orientation for <img>
      if (img.naturalWidth * img.naturalHeight > MAX_IMAGE_PIXELS || !img.naturalWidth) {
        URL.revokeObjectURL(url)
        rej(new Error('That image is too large or empty. Choose a normal photo.'))
      } else res(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      rej(new Error('That file could not be read as an image.'))
    }
    img.src = url
  })
}

export default function Capture({ onBack, onAnalyze }: Props) {
  const video = useRef<HTMLVideoElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const alive = useRef(true)
  const urls = useRef(new Set<string>()) // object URLs, revoked on unmount unless handed to Analyze
  const [cam, setCam] = useState<'starting' | 'live' | 'unavailable'>('starting')
  const [shots, setShots] = useState<HTMLImageElement[]>([]) // photos, or the video's preview frame
  const [viewing, setViewing] = useState(0) // which photo the viewfinder shows
  const [adding, setAdding] = useState(false) // camera reopened to add another photo
  const [err, setErr] = useState<string | null>(null)
  const [square, setSquare] = useState<CSSProperties>({ inset: '12.5% 0%' })
  const [frames, setFrames] = useState<HTMLCanvasElement[] | null>(null) // set when the capture is a video
  const [recording, setRecording] = useState<number | null>(null) // 0..1 progress while sampling video
  const [busy, setBusy] = useState(false)

  // Outline exactly the center square the model analyzes. The preview uses
  // object-fit: contain, so nothing the model sees is hidden off-screen.
  const fit = (el: HTMLElement, w: number, h: number) => {
    const box = el.getBoundingClientRect()
    const scale = Math.min(box.width / w, box.height / h) // object-fit: contain
    const side = Math.min(w, h) * scale
    setSquare({ left: (box.width - side) / 2, top: (box.height - side) / 2, width: side, height: side })
  }
  const measure = () => {
    const v = video.current
    if (v?.videoWidth) fit(v, v.videoWidth, v.videoHeight)
  }

  const stop = () => {
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
  }

  const start = async () => {
    setCam('starting')
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('no camera API')
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } },
        audio: false,
      })
      if (!alive.current) { s.getTracks().forEach((t) => t.stop()); return } // left the screen meanwhile
      stream.current = s
      if (video.current) {
        video.current.srcObject = s
        await video.current.play()
        measure()
      }
      setCam('live')
    } catch (e) {
      console.warn('[cropguard] camera unavailable', e)
      if (alive.current) setCam('unavailable')
    }
  }

  // Privacy: release the camera whenever the app is hidden (app switch, lock
  // screen), and turn it back on when the user returns to the viewfinder.
  const wantsCamera = useRef(true)
  wantsCamera.current = shots.length === 0 || adding
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) stop()
      else if (wantsCamera.current && !stream.current && alive.current) start()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  useEffect(() => {
    alive.current = true
    start()
    return () => {
      alive.current = false
      stop()
      urls.current.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [])

  const forget = (img: HTMLImageElement) => { URL.revokeObjectURL(img.src); urls.current.delete(img.src) }

  /** Add photos to this check (capped), then show the review. */
  const addShots = (imgs: HTMLImageElement[]) => {
    imgs.forEach((i) => urls.current.add(i.src))
    const room = MAX_PHOTOS - shots.length
    imgs.slice(room).forEach(forget)
    const kept = imgs.slice(0, room)
    if (imgs.length > room) setErr(`Up to ${MAX_PHOTOS} photos per check, so ${imgs.length - room} ${imgs.length - room === 1 ? 'was' : 'were'} left out.`)
    setShots((s) => [...s, ...kept])
    setViewing(shots.length + kept.length - 1)
    setAdding(false)
    stop()
  }

  const removeShot = (i: number) => {
    forget(shots[i])
    const next = shots.filter((_, j) => j !== i)
    setShots(next)
    setViewing(Math.max(0, Math.min(viewing, next.length - 1)))
    if (!next.length) { setFrames(null); start() }
  }

  const addAnother = () => {
    setErr(null)
    if (cam === 'unavailable') return fileInput.current?.click()
    setAdding(true)
    start()
  }

  const capture = () => {
    const v = video.current
    if (!v || !v.videoWidth) return
    const c = document.createElement('canvas')
    c.width = v.videoWidth
    c.height = v.videoHeight
    c.getContext('2d')!.drawImage(v, 0, 0)
    c.toBlob(async (b) => {
      if (!b) return
      addShots([await loadImage(b)])
    }, 'image/jpeg', 0.92)
  }

  const record = async () => {
    const v = video.current
    if (!v || !v.videoWidth || recording !== null) return
    setErr(null)
    setRecording(0)
    try {
      const fr = await framesFromStream(v, setRecording)
      if (!fr.length) throw new Error('No frames were captured. Try again.')
      const img = await previewOf(fr)
      urls.current.add(img.src)
      setFrames(fr)
      setShots([img])
      setViewing(0)
      stop()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setRecording(null)
    }
  }

  const pick = async (list: FileList | null) => {
    const files = Array.from(list ?? [])
    if (!files.length) return
    try {
      setErr(null)
      const videos = files.filter(isVideoFile)
      if (videos.length) {
        // one video on its own; videos can't be mixed with photos in one check
        if (files.length > 1 || shots.length) throw new Error('Choose either photos or one video for a check, not both.')
        setBusy(true)
        const fr = await framesFromVideoFile(videos[0])
        const img = await previewOf(fr)
        urls.current.add(img.src)
        setFrames(fr)
        setShots([img])
        setViewing(0)
        stop()
        return
      }
      const room = MAX_PHOTOS - shots.length
      const imgs: HTMLImageElement[] = []
      const failed: string[] = []
      for (const f of files.slice(0, room)) {
        try { imgs.push(await loadImage(f)) } catch (e) { failed.push((e as Error).message) }
      }
      if (imgs.length) addShots(imgs)
      const notes: string[] = []
      if (files.length > room) notes.push(`Up to ${MAX_PHOTOS} photos per check, so ${files.length - room} ${files.length - room === 1 ? 'was' : 'were'} left out.`)
      if (failed.length) notes.push(imgs.length ? `${failed.length} file${failed.length > 1 ? 's' : ''} couldn’t be used: ${failed[0]}` : failed[0])
      if (notes.length) setErr(notes.join(' '))
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
      if (fileInput.current) fileInput.current.value = '' // allow re-picking the same file
    }
  }

  const retake = () => {
    shots.forEach(forget)
    setShots([])
    setFrames(null)
    setAdding(false)
    setErr(null)
    start()
  }

  const analyze = () => {
    urls.current.clear() // the photos now belong to the result screen
    onAnalyze(frames ? { kind: 'video', frames, preview: shots[0] } : { kind: 'photos', imgs: shots })
  }

  const reviewing = shots.length > 0 && !adding
  const shot = reviewing ? shots[Math.min(viewing, shots.length - 1)] : null
  const isPhotos = !frames

  return (
    <section className="screen capture">
      <div className="topbar">
        <button className="icon-btn back" onClick={() => { stop(); onBack() }}><ArrowLeft size={20} aria-hidden />Back</button>
      </div>

      <div className="viewfinder">
        {shot ? (
          <>
            <img src={shot.src} alt={frames ? 'Sharpest frame from your video' : `Your leaf photo ${viewing + 1} of ${shots.length}`} onLoad={(e) => fit(e.currentTarget, shot.naturalWidth, shot.naturalHeight)} />
            <div className="brackets analyzed" style={square} aria-hidden><span /><span /><span /><span /></div>
          </>
        ) : (
          <>
            <video ref={video} playsInline muted aria-label="Camera preview" onLoadedMetadata={measure} />
            {cam === 'live' && <div className="brackets" style={square} aria-hidden><span /><span /><span /><span /></div>}
            {cam === 'starting' && <div className="vf-msg"><span className="spinner" aria-hidden /><p>Starting camera…</p></div>}
            {recording !== null && (
              <div className="rec-chip" role="status"><span className="rec-dot" aria-hidden />Recording… hold steady<span className="rec-bar"><span style={{ transform: `scaleX(${recording})` }} /></span></div>
            )}
            {busy && <div className="vf-msg"><span className="spinner" aria-hidden /><p>Reading the video…</p></div>}
            {cam === 'unavailable' && (
              <div className="vf-msg">
                <b>Camera not available</b>
                <p>You can still choose photos or a video of the leaf from your library.</p>
              </div>
            )}
          </>
        )}
      </div>

      {err && <div className="callout attention" role="alert"><div><b>That didn’t work.</b> {err}</div></div>}

      {shot ? (
        <>
          {isPhotos && (
            <div className="thumbs" role="list" aria-label="Photos in this check">
              {shots.map((im, i) => (
                <div key={im.src} role="listitem" className={`thumb ${i === viewing ? 'on' : ''}`}>
                  <button className="thumb-img" onClick={() => setViewing(i)} aria-label={`Show photo ${i + 1}`} aria-pressed={i === viewing}>
                    <img src={im.src} alt="" />
                  </button>
                  <button className="thumb-x" onClick={() => removeShot(i)} aria-label={`Remove photo ${i + 1}`}><X size={14} weight="bold" aria-hidden /></button>
                </div>
              ))}
              {shots.length < MAX_PHOTOS && (
                <button className="thumb add" onClick={addAnother} aria-label="Add another photo"><Plus size={22} aria-hidden /></button>
              )}
            </div>
          )}
          <p className="hint">
            {frames
              ? 'Video captured. CropGuard picks the sharpest moments and checks them together. Only the area inside the square is checked.'
              : shots.length === 1
                ? 'Only the area inside the square is checked. Is the leaf sharp and filling most of it? For a more reliable result, add 1 or 2 more photos of the same plant.'
                : `${shots.length} photos of the same plant. CropGuard checks each one and combines them, which is more reliable than a single photo.`}
          </p>
          <div className="row-actions">
            <button className="btn" onClick={retake}><ArrowClockwise size={20} aria-hidden />{shots.length > 1 ? 'Start over' : 'Retake'}</button>
            <button className="btn primary" onClick={analyze}>{isPhotos && shots.length > 1 ? `Check ${shots.length} photos` : 'Check this leaf'}</button>
          </div>
        </>
      ) : (
        <>
          {adding
            ? <p className="hint">Photo {shots.length + 1} of up to {MAX_PHOTOS}: another leaf of the same plant, or the same leaf from a different angle.</p>
            : <ul className="tips stagger">{tips(cam === 'live').map((t) => <li key={t.text}><span className="tip-icon">{t.icon}</span>{t.text}</li>)}</ul>}
          {cam === 'live' ? (
            <div className="capture-bar">
              <button className="gallery-btn" onClick={() => fileInput.current?.click()}><ImageSquare size={24} aria-hidden />Library</button>
              <button className="shutter" onClick={capture} aria-label="Take photo" disabled={recording !== null} />
              {adding
                ? <button className="gallery-btn" onClick={() => { setAdding(false); stop() }}><ArrowLeft size={24} aria-hidden />Your photos</button>
                : <button className="gallery-btn video-btn" onClick={record} disabled={recording !== null}><VideoCamera size={24} aria-hidden />Video</button>}
            </div>
          ) : (
            <button className="btn primary full" onClick={() => fileInput.current?.click()}><ImageSquare size={20} aria-hidden />{adding ? 'Choose more photos' : 'Choose photos or a video'}</button>
          )}
        </>
      )}
      <input ref={fileInput} type="file" accept={adding || shots.length ? 'image/*' : 'image/*,video/*'} multiple hidden onChange={(e) => pick(e.target.files)} />
    </section>
  )
}

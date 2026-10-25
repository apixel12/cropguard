/**
 * Video input: turn a camera stream or an uploaded clip into a handful of
 * sharp still frames. Each frame goes through the same quality gate as a
 * photo; the sharpest ones that pass are analysed and their predictions are
 * averaged (see classify.ts), which also makes results steadier when some
 * frames are blurred by hand shake.
 */
import { checkQuality, type QualityReport } from './qualityGate'

export type Source = HTMLImageElement | HTMLCanvasElement

export const MAX_VIDEO_BYTES = 200 * 1024 * 1024
export const MAX_VIDEO_SECONDS = 60
const SAMPLE_COUNT = 14 // frames sampled from a clip or stream
export const BEST_COUNT = 5 // sharpest passing frames that are analysed
// 14 frames at 1280 px ≈ 50 MB of canvas; 1920 px was ~115 MB, enough to crash iOS Safari.
// The models see a 224-288 px crop and the quality gate 160 px, so nothing is lost.
const MAX_FRAME_SIDE = 1280

function snapshot(v: HTMLVideoElement): HTMLCanvasElement {
  const scale = Math.min(1, MAX_FRAME_SIDE / Math.max(v.videoWidth, v.videoHeight))
  const c = document.createElement('canvas')
  c.width = Math.round(v.videoWidth * scale)
  c.height = Math.round(v.videoHeight * scale)
  c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height)
  return c
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Sample frames from a live camera <video> over ~2.5 s. */
export async function framesFromStream(v: HTMLVideoElement, onProgress?: (f: number) => void): Promise<HTMLCanvasElement[]> {
  const frames: HTMLCanvasElement[] = []
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    if (v.videoWidth) frames.push(snapshot(v))
    onProgress?.((i + 1) / SAMPLE_COUNT)
    await wait(180)
  }
  return frames
}

function seek(v: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((res, rej) => {
    const done = () => { v.removeEventListener('seeked', done); clearTimeout(timer); res() }
    const timer = setTimeout(() => { v.removeEventListener('seeked', done); rej(new Error('The video could not be read.')) }, 8000)
    v.addEventListener('seeked', done)
    v.currentTime = t
  })
}

/** Browser-recorded WebM files often report an infinite duration until the
 * player has seen the end; seeking far past it makes the real value appear. */
function resolveDuration(v: HTMLVideoElement): Promise<void> {
  return new Promise((res) => {
    const done = () => { v.removeEventListener('durationchange', check); clearTimeout(timer); res() }
    const check = () => { if (Number.isFinite(v.duration)) done() }
    const timer = setTimeout(done, 8000)
    v.addEventListener('durationchange', check)
    v.currentTime = 1e101
  })
}

/** Sample frames evenly from an uploaded video file. */
export async function framesFromVideoFile(file: Blob): Promise<HTMLCanvasElement[]> {
  if (file.size > MAX_VIDEO_BYTES) throw new Error('That video is too large. Use a clip under 200 MB.')
  if (file.type && !file.type.startsWith('video/')) throw new Error('That file isn’t a video.')
  const url = URL.createObjectURL(file)
  const v = document.createElement('video')
  v.muted = true
  v.playsInline = true
  v.preload = 'auto'
  try {
    await new Promise<void>((res, rej) => {
      v.onloadedmetadata = () => res()
      v.onerror = () => rej(new Error('That video format can’t be played on this device.'))
      v.src = url
    })
    if (v.duration === Infinity) await resolveDuration(v)
    if (!v.videoWidth || !Number.isFinite(v.duration) || v.duration <= 0) throw new Error('That video is empty.')
    if (v.duration > MAX_VIDEO_SECONDS + 1) throw new Error('Use a clip of one minute or less.')
    const frames: HTMLCanvasElement[] = []
    for (let i = 0; i < SAMPLE_COUNT; i++) {
      // stay clear of the very first/last frame (often black or blurred)
      await seek(v, (v.duration * (i + 0.5)) / SAMPLE_COUNT)
      frames.push(snapshot(v))
    }
    return frames
  } finally {
    v.removeAttribute('src')
    v.load()
    URL.revokeObjectURL(url)
  }
}

export interface FrameChoice {
  best: Source[] // sharpest frames that pass the quality gate (≥1), best first
  report: QualityReport // the best frame's report (used if nothing passes)
  sampled: number
}

/** Rank frames by sharpness; keep the best that pass the quality gate. */
export function chooseFrames(frames: Source[], k = BEST_COUNT): FrameChoice {
  const rated = frames.map((f) => ({ f, q: checkQuality(f) })).sort((a, b) => b.q.stats.blurVar - a.q.stats.blurVar)
  const passing = rated.filter((r) => r.q.ok)
  return {
    best: passing.slice(0, k).map((r) => r.f),
    report: (passing[0] ?? rated[0]).q,
    sampled: frames.length,
  }
}

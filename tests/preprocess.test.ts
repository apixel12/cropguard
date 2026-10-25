import { describe, expect, it, beforeAll } from 'vitest'
import * as tf from '@tensorflow/tfjs-core'
import '@tensorflow/tfjs-backend-cpu'
import golden from './fixtures/resize_golden.json'
import { centerSquare, resizeBilinearRGB } from '../src/ml/preprocess'

// The app's crop (centerSquare + canvas copy) applied to raw RGB data (jsdom has no canvas pixels)
function cropRGB(rgb: number[], h: number, w: number) {
  const { sx, sy, s } = centerSquare(w, h)
  const out: number[] = []
  for (let y = sy; y < sy + s; y++) for (let x = sx; x < sx + s; x++) for (let k = 0; k < 3; k++) out.push(rgb[(y * w + x) * 3 + k])
  return { rgb: out, s }
}
const cropped = cropRGB(golden.rgb, golden.h, golden.w)

// tf.js reference resize on the cropped square
const preprocessRGB = (rgb: number[], h: number, w: number) =>
  tf.tidy(() =>
    tf.expandDims(tf.clipByValue(tf.image.resizeBilinear(tf.tensor3d(rgb, [h, w, 3], 'float32'), [224, 224], false, true), 0, 255), 0),
  )

describe('preprocessing matches training (center square + tf.image.resize bilinear)', () => {
  it('centerSquare uses the same floor offsets as tf (h-s)//2, (w-s)//2', () => {
    expect(centerSquare(37, 53)).toEqual({ sx: 0, sy: 8, s: 37 })
    expect(centerSquare(4032, 3024)).toEqual({ sx: 504, sy: 0, s: 3024 })
    expect(centerSquare(641, 480)).toEqual({ sx: 80, sy: 0, s: 480 })
  })

  beforeAll(async () => { await tf.setBackend('cpu') })

  it('produces [1,224,224,3] float32 in [0,255]', () => {
    const t = preprocessRGB(cropped.rgb, cropped.s, cropped.s)
    expect(t.shape).toEqual([1, 224, 224, 3])
    expect(t.dtype).toBe('float32')
    expect(tf.max(t).dataSync()[0]).toBeLessThanOrEqual(255)
    expect(tf.min(t).dataSync()[0]).toBeGreaterThanOrEqual(0)
    t.dispose()
  })

  it('pixel values match Python golden samples', () => {
    const t = preprocessRGB(cropped.rgb, cropped.s, cropped.s)
    const a = t.arraySync() as number[][][][]
    for (const s of golden.samples)
      s.rgb.forEach((v, c) => expect(a[0][s.y][s.x][c]).toBeCloseTo(v, 2))
    expect(tf.mean(t).dataSync()[0]).toBeCloseTo(golden.mean, 2)
    t.dispose()
  })

  it('app CPU resize (resizeBilinearRGB) matches Python golden samples', () => {
    const out = resizeBilinearRGB(cropped.rgb, cropped.s, cropped.s, 3)
    for (const s of golden.samples)
      s.rgb.forEach((v, c) => expect(out[(s.y * 224 + s.x) * 3 + c]).toBeCloseTo(v, 2))
    expect(out.reduce((a, b) => a + b, 0) / out.length).toBeCloseTo(golden.mean, 2)
  })

  it('app CPU resize matches tf.image.resizeBilinear everywhere', () => {
    const ref = preprocessRGB(cropped.rgb, cropped.s, cropped.s)
    const a = ref.dataSync()
    const b = resizeBilinearRGB(cropped.rgb, cropped.s, cropped.s, 3)
    let max = 0
    for (let i = 0; i < a.length; i++) max = Math.max(max, Math.abs(a[i] - b[i]))
    expect(max).toBeLessThan(1e-3)
    ref.dispose()
  })

  it('does not leak tensors', () => {
    const before = tf.memory().numTensors
    preprocessRGB(cropped.rgb, cropped.s, cropped.s).dispose()
    expect(tf.memory().numTensors).toBe(before)
  })
})

import { describe, expect, it } from 'vitest'
import { analyzePixels } from '../src/ml/qualityGate'

const W = 160, H = 120
function img(fn: (x: number, y: number) => [number, number, number]) {
  const a = new Uint8ClampedArray(W * H * 4)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const [r, g, b] = fn(x, y); const i = (y * W + x) * 4
    a[i] = r; a[i + 1] = g; a[i + 2] = b; a[i + 3] = 255
  }
  return a
}
// textured green leaf
const leaf = img((x, y) => { const v = ((x * 13 + y * 7) % 17) * 6; return [40 + v, 110 + v, 30 + v / 2] })

describe('image quality gate', () => {
  it('passes a textured green leaf', () => expect(analyzePixels(leaf, W, H, 1600, 1200).issues).toEqual([]))
  it('flags dark images', () => expect(analyzePixels(img(() => [8, 10, 6]), W, H, 1600, 1200).issues).toContain('too-dark'))
  it('flags overexposed images', () => expect(analyzePixels(img(() => [252, 252, 252]), W, H, 1600, 1200).issues).toContain('too-bright'))
  it('flags flat/blurry images', () => expect(analyzePixels(img(() => [60, 120, 50]), W, H, 1600, 1200).issues).toContain('blurry'))
  it('checks mildly blurry photos but marks them, instead of refusing them', () => {
    // low-contrast texture: Laplacian variance between the hard (3) and soft (18) limits
    const soft = img((x, y) => { const v = ((x * 13 + y * 7) % 17) * 0.14; return [50 + v, 115 + v, 35 + v / 2] })
    const r = analyzePixels(soft, W, H, 1600, 1200)
    expect(r.stats.blurVar).toBeGreaterThan(3)
    expect(r.stats.blurVar).toBeLessThan(18)
    expect(r.ok).toBe(true)
    expect(r.softBlur).toBe(true)
  })
  it('a sharp photo carries no blur note', () => expect(analyzePixels(leaf, W, H, 1600, 1200).softBlur).toBe(false))
  it('accepts a leaf photographed on white paper', () => {
    // 70% blown-out white background, textured green leaf in the middle
    const onPaper = img((x, y) => {
      if (x > 40 && x < 120 && y > 25 && y < 95) { const v = ((x * 13 + y * 7) % 17) * 6; return [40 + v, 110 + v, 30 + v / 2] }
      return [252, 252, 252]
    })
    const r = analyzePixels(onPaper, W, H, 1600, 1200)
    expect(r.stats.clipped).toBeGreaterThan(0.6)
    expect(r.issues).not.toContain('too-bright')
  })
  it('flags tiny images', () => expect(analyzePixels(leaf, W, H, 100, 80).issues).toContain('too-small'))
  it('flags images without plant colours', () => {
    const blue = img((x, y) => { const v = ((x * 13 + y * 7) % 17) * 6; return [30 + v, 60 + v, 160 + v] })
    expect(analyzePixels(blue, W, H, 1600, 1200).issues).toContain('no-leaf')
  })
})

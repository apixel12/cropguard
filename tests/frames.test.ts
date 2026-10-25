import * as tf from '@tensorflow/tfjs-core'
import '@tensorflow/tfjs-backend-cpu'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { QualityReport } from '../src/ml/qualityGate'

// Each fake frame carries its own sharpness and pass/fail verdict.
type Fake = HTMLCanvasElement & { blur: number; ok: boolean }
const frame = (blur: number, ok = true) => Object.assign(document.createElement('canvas'), { blur, ok }) as Fake
vi.mock('../src/ml/qualityGate', () => ({
  checkQuality: (f: Fake): QualityReport => ({ ok: f.ok, issues: f.ok ? [] : ['blurry'], stats: { blurVar: f.blur } } as unknown as QualityReport),
}))
vi.mock('../src/ml/preprocess', () => ({ toInputTensor: () => tf.zeros([1, 224, 224, 3]) }))

const { chooseFrames, framesFromVideoFile } = await import('../src/ml/frames')
const { runModel } = await import('../src/ml/classify')

beforeAll(async () => { await tf.setBackend('cpu') })

describe('video frame selection', () => {
  it('keeps the sharpest frames that pass the quality gate, best first', () => {
    const fs = [frame(10), frame(90), frame(50), frame(200, false), frame(70)]
    const c = chooseFrames(fs, 3)
    expect(c.best.map((f) => (f as Fake).blur)).toEqual([90, 70, 50])
    expect(c.sampled).toBe(5)
  })
  it('returns no frames, and the sharpest report, when none pass', () => {
    const c = chooseFrames([frame(5, false), frame(9, false)])
    expect(c.best).toEqual([])
    expect(c.report.stats.blurVar).toBe(9)
  })
})

describe('uploaded video guards', () => {
  it('refuses oversized videos before decoding', async () => {
    await expect(framesFromVideoFile({ size: 201 * 1024 * 1024, type: 'video/mp4' } as Blob)).rejects.toThrow(/too large/)
  })
  it('refuses files that are not videos', async () => {
    await expect(framesFromVideoFile(new Blob(['x'], { type: 'text/html' }))).rejects.toThrow(/isn’t a video/)
  })
})

describe('multi-frame prediction', () => {
  it('averages per-frame probabilities before deciding', async () => {
    const outs = [[0.9, 0.1], [0.5, 0.5]]
    let i = 0
    const m = {
      id: 'crops-v2',
      model: { predict: () => tf.tensor2d([outs[i++]]) },
      meta: { classCount: 2, classes: ['A', 'B'], modelVersion: 'crops-v2', thresholds: { confidence: 0.99, margin: 0 }, inputSize: [224, 224] },
    } as never
    const p = await runModel(m, [frame(1), frame(2)])
    expect(p.frames).toBe(2)
    expect(p.top[0].label).toBe('A')
    expect(p.top[0].confidence).toBeCloseTo(0.7, 5)
  })
  it('combines separate photos by geometric mean, and reports each photo\'s answer', async () => {
    const outs = [[0.9, 0.1], [0.5, 0.5], [0.2, 0.8]]
    let i = 0
    const m = {
      id: 'crops-v2',
      model: { predict: () => tf.tensor2d([outs[i++]]) },
      meta: { classCount: 2, classes: ['A', 'B'], modelVersion: 'crops-v2', thresholds: { confidence: 0.99, margin: 0 }, inputSize: [224, 224] },
    } as never
    const p = await runModel(m, [frame(1), frame(2)], 'geometric')
    // sqrt(.9*.5)=.6708, sqrt(.1*.5)=.2236 -> .75 / .25
    expect(p.top[0].label).toBe('A')
    expect(p.top[0].confidence).toBeCloseTo(0.75, 4)
    expect(p.perImageTop).toEqual(['A', 'A'])
    const q = await runModel(m, [frame(3)], 'geometric')
    expect(q.perImageTop).toEqual(['B'])
  })
  it('frees the input tensor even when inference fails', async () => {
    const before = tf.memory().numTensors
    const m = { model: { predict: () => { throw new Error('boom') } }, meta: { classCount: 2, inputSize: [224, 224] } } as never
    await expect(runModel(m, frame(1))).rejects.toThrow('boom')
    expect(tf.memory().numTensors).toBe(before)
  })
})

describe('photos that disagree', () => {
  it('a compromise answer is not named', async () => {
    const { needsMajority } = await import('../src/ml/classify')
    expect(needsMajority('Late_blight', ['Early_blight', 'healthy'])).toBe(true) // supported by neither photo
    expect(needsMajority('Early_blight', ['Early_blight', 'healthy'])).toBe(true) // only half
    expect(needsMajority('Early_blight', ['Early_blight', 'Early_blight', 'healthy'])).toBe(false) // majority
    expect(needsMajority('Early_blight', ['Early_blight', 'Early_blight'])).toBe(false) // all agree
    expect(needsMajority('Early_blight', ['Late_blight'])).toBe(false) // a single photo is never split
  })
})

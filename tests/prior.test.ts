import { describe, expect, it } from 'vitest'
import { applyPriorCorrection } from '../src/ml/classify'

describe('prior correction (logit adjustment)', () => {
  it('is identity without a correction', () => {
    expect(Array.from(applyPriorCorrection([0.2, 0.8]))).toEqual([Float32Array.from([0.2])[0], Float32Array.from([0.8])[0]])
  })
  it('matches p * w**-alpha renormalised (training formula)', () => {
    const p = [0.5, 0.3, 0.2], w = [0.5, 1, 4], a = 1.2
    const raw = p.map((v, i) => v * w[i] ** -a)
    const s = raw.reduce((x, y) => x + y)
    const q = applyPriorCorrection(p, { alpha: a, classWeights: w })
    raw.forEach((v, i) => expect(q[i]).toBeCloseTo(v / s, 6))
    expect(q.reduce((x, y) => x + y)).toBeCloseTo(1, 6)
  })
  it('down-weights over-predicted rare classes', () => {
    const q = applyPriorCorrection([0.5, 0.5], { alpha: 1, classWeights: [1, 6] })
    expect(q[0]).toBeGreaterThan(q[1])
  })
})

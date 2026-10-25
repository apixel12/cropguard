import { describe, expect, it } from 'vitest'
import { conditionOnCrop, CROP_MASS_MIN } from '../src/ml/plantVillageClassifier'

const classes = ['Potato___Late_blight', 'Potato___healthy', 'Tomato___Late_blight', 'Tomato___healthy']

describe('scoring within the identified plant', () => {
  it('a look-alike on another crop no longer competes', () => {
    // model: 45% tomato late blight, 40% potato late blight; the plant is potato
    const { probs, cropMass } = conditionOnCrop([0.4, 0.1, 0.45, 0.05], classes, 'Potato')
    expect(cropMass).toBeCloseTo(0.5, 6)
    expect(probs[0]).toBeCloseTo(0.8, 6)
    expect(probs[2]).toBe(0)
  })
  it('reports little mass when the leaf looks like a different plant', () => {
    const { cropMass } = conditionOnCrop([0.05, 0.05, 0.6, 0.3], classes, 'Potato')
    expect(cropMass).toBeLessThan(CROP_MASS_MIN)
  })
  it('conditioned probabilities sum to 1', () => {
    const { probs } = conditionOnCrop([0.2, 0.3, 0.4, 0.1], classes, 'Tomato')
    expect(probs.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6)
  })
})

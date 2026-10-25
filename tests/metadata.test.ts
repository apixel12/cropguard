import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { lemonInfo, LEMON_CONDITIONS } from '../src/data/lemonDiseases'
import { PLANTVILLAGE_CONDITIONS } from '../src/data/plantVillageDiseases'
import { validateMetadata } from '../src/ml/modelLoader'
import type { ModelMetadata } from '../src/ml/modelRegistry'

const base: ModelMetadata = {
  modelVersion: 'lemon-v1', architecture: 'MobileNetV2', format: 'tfjs_graph_model',
  inputSize: [224, 224], inputShape: [1, 224, 224, 3], colorMode: 'RGB', dataset: 'x',
  classCount: 2, classes: ['a', 'b'],
  normalization: { inputRange: [0, 255], inModel: true, formula: 'pixel / 127.5 - 1', resize: 'bilinear' },
  trainingDate: '2026-10-05', thresholds: { confidence: 0.8, margin: 0.2 }, metrics: {}, license: 'CC BY 4.0',
}

describe('metadata validation', () => {
  it('accepts consistent metadata', () => expect(() => validateMetadata(base, 'lemon-v1')).not.toThrow())
  it('rejects class count mismatch', () => expect(() => validateMetadata({ ...base, classCount: 3 }, 'lemon-v1')).toThrow(/classCount/))
  it('rejects wrong model id', () => expect(() => validateMetadata(base, 'crops-v2')).toThrow())
  it('rejects missing thresholds', () =>
    expect(() => validateMetadata({ ...base, thresholds: undefined as never }, 'lemon-v1')).toThrow(/threshold/))
  it('rejects external normalization', () =>
    expect(() => validateMetadata({ ...base, normalization: { ...base.normalization, inModel: false } }, 'lemon-v1')).toThrow())
})

describe('disease data covers every model class', () => {
  it('has 18 lemon entries', () => expect(Object.keys(LEMON_CONDITIONS)).toHaveLength(18))
  it('has 68 crop entries (PlantVillage 38 + beans 3 + field crops 27)', () => expect(Object.keys(PLANTVILLAGE_CONDITIONS)).toHaveLength(68))

  for (const [dir, lookup, n] of [
    ['lemon-v1', (l: string) => lemonInfo(l), 18],
    ['crops-v2', (l: string) => PLANTVILLAGE_CONDITIONS[l], 67],
  ] as const) {
    const p = `public/models/${dir}/metadata.json`
    it.skipIf(!existsSync(p))(`${dir}: every exported class has info and count is ${n}`, () => {
      const meta = JSON.parse(readFileSync(p, 'utf8')) as ModelMetadata
      expect(meta.classCount).toBe(n)
      expect(meta.classes).toHaveLength(n)
      const infos = meta.classes.map((c) => lookup(c))
      expect(infos.filter((x) => !x), `unmapped: ${meta.classes.filter((c) => !lookup(c))}`).toHaveLength(0)
      expect(new Set(infos).size).toBe(n) // no two classes map to the same entry
      validateMetadata(meta, dir)
    })
  }
})

describe('plant identification routes every plant to a disease model', () => {
  const p = 'public/models/router-v2/metadata.json'
  it.skipIf(!existsSync(p))('each router class maps to lemon or a garden crop', async () => {
    const { plantFromName } = await import('../src/ml/router')
    const meta = JSON.parse(readFileSync(p, 'utf8')) as ModelMetadata
    const unmapped = meta.classes.filter((c) => !plantFromName(c))
    expect(unmapped).toEqual([])
    expect(meta.classes).toContain('Lemon')
  })
})

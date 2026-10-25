import { describe, expect, it } from 'vitest'
import { farmerInfo, HEALTHY_FARMER } from '../src/data/farmerDetails'
import { LEMON_CONDITIONS } from '../src/data/lemonDiseases'
import { PLANTVILLAGE_CONDITIONS } from '../src/data/plantVillageDiseases'

const all = [...Object.values(PLANTVILLAGE_CONDITIONS), ...Object.values(LEMON_CONDITIONS)]

describe('farmer mode content', () => {
  it('exists for every condition the app can report', () => {
    const missing = all.filter((c) => !farmerInfo(c)).map((c) => `${c.crop} | ${c.name}`)
    expect(missing).toEqual([])
  })
  it('healthy results get a scouting plan, diseases get their own entry', () => {
    for (const c of all) {
      const f = farmerInfo(c)!
      if (c.severity === 'none') expect(f).toBe(HEALTHY_FARMER)
      else expect(f).not.toBe(HEALTHY_FARMER)
      expect(f.management.length).toBeGreaterThan(0)
    }
  })
  it('never names a pesticide product or a dose', () => {
    const text = JSON.stringify(all.map((c) => farmerInfo(c)))
    expect(text).not.toMatch(/\b\d+(\.\d+)?\s?(ml|g|kg|l|oz|lb)\s?(\/|per)\s?(ha|acre|l|gal)/i)
  })
})

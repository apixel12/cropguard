import { describe, expect, it } from 'vitest'
import { deleteScan, listScans, saveScan } from '../src/db/history'

const rec = (prediction: string) => ({
  crop: 'Lemon', modelVersion: 'lemon-v1', prediction, status: 'confident' as const, confidence: 0.9,
  thumbnail: new Blob(['x'], { type: 'image/jpeg' }),
})

describe('IndexedDB history', () => {
  it('saves, lists newest first, and deletes', async () => {
    const a = await saveScan(rec('Healthy'))
    await new Promise((r) => setTimeout(r, 5))
    const b = await saveScan(rec('Citrus Canker'))
    let all = await listScans()
    expect(all.map((s) => s.id)).toEqual([b.id, a.id])
    expect(all[0].modelVersion).toBe('lemon-v1')
    await deleteScan(a.id)
    all = await listScans()
    expect(all.map((s) => s.id)).toEqual([b.id])
  })
})

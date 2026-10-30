import { describe, expect, it } from 'vitest'
import { deleteScan, listScans, putScan, recentScans, saveScan } from '../src/db/history'

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

  it('reads just the newest few scans for Home', async () => {
    for (let k = 0; k < 6; k++) await putScan({ ...rec(`p${k}`), id: `r${k}`, timestamp: Date.now() + 60_000 + k })
    const top = await recentScans(3)
    expect(top.map((s) => s.id)).toEqual(['r5', 'r4', 'r3'])
  })
})

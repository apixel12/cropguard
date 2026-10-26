import { openDB, type IDBPDatabase } from 'idb'

export interface ScanRecord {
  id: string
  timestamp: number
  crop: string
  modelVersion: string
  prediction: string // class label, or "Uncertain"
  status: 'confident' | 'uncertain'
  confidence: number // top-1 model confidence
  thumbnail?: Blob // small JPEG, never the full-resolution photo; never uploaded, so synced-in scans have none
  synced?: boolean // copied to the signed-in account (results only)
}

const DB = 'cropguard'
const STORE = 'scans'
let dbp: Promise<IDBPDatabase> | null = null

function db() {
  dbp ??= openDB(DB, 1, {
    upgrade(d) {
      const s = d.createObjectStore(STORE, { keyPath: 'id' })
      s.createIndex('timestamp', 'timestamp')
    },
  })
  return dbp
}

export async function saveScan(r: Omit<ScanRecord, 'id' | 'timestamp'>): Promise<ScanRecord> {
  const rec: ScanRecord = { ...r, id: crypto.randomUUID(), timestamp: Date.now() }
  await (await db()).put(STORE, rec)
  return rec
}

export async function listScans(): Promise<ScanRecord[]> {
  const all = await (await db()).getAllFromIndex(STORE, 'timestamp')
  return all.reverse()
}

/** Store a scan as-is (used when merging history synced from another device). */
export async function putScan(rec: ScanRecord): Promise<void> {
  await (await db()).put(STORE, rec)
}

export async function markSynced(ids: string[]): Promise<void> {
  const d = await db()
  for (const id of ids) {
    const r = (await d.get(STORE, id)) as ScanRecord | undefined
    if (r && !r.synced) await d.put(STORE, { ...r, synced: true })
  }
}

export async function deleteScan(id: string): Promise<void> {
  await (await db()).delete(STORE, id)
}

export async function clearScans(): Promise<void> {
  await (await db()).clear(STORE)
}

export async function makeThumbnail(img: ImageBitmap | HTMLImageElement | HTMLCanvasElement, max = 192): Promise<Blob> {
  const w = 'naturalWidth' in img ? img.naturalWidth : img.width
  const h = 'naturalHeight' in img ? img.naturalHeight : img.height
  const s = max / Math.max(w, h)
  const c = document.createElement('canvas')
  c.width = Math.round(w * s)
  c.height = Math.round(h * s)
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('thumbnail failed'))), 'image/jpeg', 0.75))
}

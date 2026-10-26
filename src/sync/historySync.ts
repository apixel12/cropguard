import { authConfigured, supabase } from '../auth/client'
import { clearScans, deleteScan, listScans, markSynced, putScan, type ScanRecord } from '../db/history'

/**
 * Optional history sync for signed-in users. Only RESULTS are synced (plant,
 * condition label, status, confidence, model version, time): never photos or
 * thumbnails. The `scans` table only ever returns or accepts the signed-in
 * user's own rows (row-level security, supabase/migrations/0001_cropguard.sql).
 */
const TABLE = 'scans'

type Row = {
  id: string
  crop: string
  prediction: string
  status: 'confident' | 'uncertain'
  confidence: number
  model_version: string
  scanned_at: string
}

const toRow = (r: ScanRecord): Row => ({
  id: r.id,
  crop: r.crop.slice(0, 64),
  prediction: r.prediction.slice(0, 128),
  status: r.status,
  confidence: Math.min(1, Math.max(0, r.confidence)),
  model_version: r.modelVersion.slice(0, 32),
  scanned_at: new Date(r.timestamp).toISOString(),
})

async function signedIn(): Promise<boolean> {
  if (!authConfigured) return false
  const { data } = await supabase().auth.getSession()
  if (!data.session) return false
  // with two-factor enabled, the database only accepts fully verified (AAL2) sessions
  const aal = await supabase().auth.mfa.getAuthenticatorAssuranceLevel()
  return !(aal.data && aal.data.nextLevel === 'aal2' && aal.data.currentLevel !== 'aal2')
}

/** Upload unsynced local results, then download results made on other devices. */
export async function syncNow(): Promise<{ uploaded: number; downloaded: number }> {
  if (!(await signedIn())) return { uploaded: 0, downloaded: 0 }
  const sb = supabase()
  const local = await listScans()
  const pending = local.filter((r) => !r.synced)
  for (let i = 0; i < pending.length; i += 200) {
    const batch = pending.slice(i, i + 200)
    const { error } = await sb.from(TABLE).upsert(batch.map(toRow), { onConflict: 'id' })
    if (error) throw new Error('Couldn’t sync your history right now.')
    await markSynced(batch.map((r) => r.id))
  }
  const { data, error } = await sb.from(TABLE).select('id,crop,prediction,status,confidence,model_version,scanned_at').order('scanned_at', { ascending: false }).limit(5000)
  if (error) throw new Error('Couldn’t sync your history right now.')
  const have = new Set(local.map((r) => r.id))
  let downloaded = 0
  for (const row of (data ?? []) as Row[]) {
    if (have.has(row.id)) continue
    await putScan({ id: row.id, timestamp: Date.parse(row.scanned_at), crop: row.crop, prediction: row.prediction, status: row.status, confidence: row.confidence, modelVersion: row.model_version, synced: true })
    downloaded++
  }
  return { uploaded: pending.length, downloaded }
}

/** Best effort after each new scan; anything missed is picked up by the next syncNow(). */
export async function pushScan(r: ScanRecord): Promise<void> {
  try {
    if (!(await signedIn())) return
    const { error } = await supabase().from(TABLE).upsert(toRow(r), { onConflict: 'id' })
    if (!error) await markSynced([r.id])
  } catch { /* offline: synced later */ }
}

export async function removeScan(id: string): Promise<void> {
  await deleteScan(id)
  if (await signedIn().catch(() => false)) await supabase().from(TABLE).delete().eq('id', id)
}

export async function removeAllScans(): Promise<void> {
  await clearScans()
  if (await signedIn().catch(() => false)) {
    // RLS limits this to the user's own rows; the filter is required by the client
    await supabase().from(TABLE).delete().not('id', 'is', null)
  }
}

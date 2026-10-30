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

const PAGE = 1000
// Where the last download stopped (server time each row was uploaded), per account,
// so each sync only fetches rows added since, not the whole history again.
const cursorKey = (userId: string) => `cg-sync-${userId}`
const readCursor = (userId: string) => { try { return localStorage.getItem(cursorKey(userId)) } catch { return null } }
const writeCursor = (userId: string, v: string) => { try { localStorage.setItem(cursorKey(userId), v) } catch { /* next sync re-checks */ } }

const toRow = (r: ScanRecord): Row => ({
  id: r.id,
  crop: r.crop.slice(0, 64),
  prediction: r.prediction.slice(0, 128),
  status: r.status,
  confidence: Math.min(1, Math.max(0, r.confidence)),
  model_version: r.modelVersion.slice(0, 32),
  scanned_at: new Date(r.timestamp).toISOString(),
})

/** The signed-in user's id, or null if signed out (or still needs the second factor). */
async function signedIn(): Promise<string | null> {
  if (!authConfigured) return null
  const { data } = await supabase().auth.getSession()
  if (!data.session) return null
  // with two-factor enabled, the database only accepts fully verified (AAL2) sessions
  const aal = await supabase().auth.mfa.getAuthenticatorAssuranceLevel()
  return aal.data && aal.data.nextLevel === 'aal2' && aal.data.currentLevel !== 'aal2' ? null : data.session.user.id
}

/** Upload unsynced local results, then download results made on other devices. */
export async function syncNow(): Promise<{ uploaded: number; downloaded: number }> {
  const userId = await signedIn()
  if (!userId) return { uploaded: 0, downloaded: 0 }
  const sb = supabase()
  const local = await listScans()
  const pending = local.filter((r) => !r.synced)
  for (let i = 0; i < pending.length; i += 200) {
    const batch = pending.slice(i, i + 200)
    const { error } = await sb.from(TABLE).upsert(batch.map(toRow), { onConflict: 'id' })
    if (error) throw new Error('Couldn’t sync your history right now.')
    await markSynced(batch.map((r) => r.id))
  }
  // Download only rows uploaded since the last sync, a page at a time (oldest first, so the
  // cursor can advance safely; >= plus the id check copes with rows sharing a timestamp).
  const have = new Set(local.map((r) => r.id))
  let cursor = readCursor(userId)
  let downloaded = 0
  for (;;) {
    let q = sb.from(TABLE).select('id,crop,prediction,status,confidence,model_version,scanned_at,created_at').order('created_at', { ascending: true }).limit(PAGE)
    if (cursor) q = q.gte('created_at', cursor)
    const { data, error } = await q
    if (error) throw new Error('Couldn’t sync your history right now.')
    const rows = (data ?? []) as (Row & { created_at: string })[]
    for (const row of rows) {
      if (have.has(row.id)) continue
      have.add(row.id)
      await putScan({ id: row.id, timestamp: Date.parse(row.scanned_at), crop: row.crop, prediction: row.prediction, status: row.status, confidence: row.confidence, modelVersion: row.model_version, synced: true })
      downloaded++
    }
    const last = rows.at(-1)?.created_at
    if (last) { writeCursor(userId, last); cursor = last }
    // a full page whose rows all share one timestamp would loop forever; stop instead
    if (rows.length < PAGE || rows[0].created_at === last) break
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

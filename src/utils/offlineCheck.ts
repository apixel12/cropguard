import { MODELS, type ModelId } from '../ml/modelRegistry'

/** True only if model.json, metadata.json and EVERY weight shard listed in the
 * model's weightsManifest are present in Cache Storage. */
export async function modelCachedOffline(id: ModelId): Promise<boolean> {
  if (!('caches' in window)) return false
  const base = MODELS[id].base
  const json = await caches.match(`${base}/model.json`, { ignoreSearch: true })
  if (!json || !(await caches.match(`${base}/metadata.json`, { ignoreSearch: true }))) return false
  const manifest = (await json.clone().json()).weightsManifest as { paths: string[] }[]
  for (const group of manifest)
    for (const p of group.paths)
      if (!(await caches.match(`${base}/${p}`, { ignoreSearch: true }))) return false
  return true
}

export async function allModelsCached(): Promise<boolean> {
  const r = await Promise.all((Object.keys(MODELS) as ModelId[]).map(modelCachedOffline))
  return r.every(Boolean)
}

import { afterEach, describe, expect, it, vi } from 'vitest'
import { modelCachedOffline } from '../src/utils/offlineCheck'

function mockCaches(present: string[]) {
  const manifest = { weightsManifest: [{ paths: ['group1-shard1of2.bin', 'group1-shard2of2.bin'] }] }
  vi.stubGlobal('caches', {
    match: async (url: string) =>
      present.includes(url) ? new Response(url.endsWith('model.json') ? JSON.stringify(manifest) : 'x') : undefined,
  })
}
afterEach(() => vi.unstubAllGlobals())

const B = '/models/lemon-v1'
describe('offline readiness check', () => {
  it('true only when json, metadata and every shard are cached', async () => {
    mockCaches([`${B}/model.json`, `${B}/metadata.json`, `${B}/group1-shard1of2.bin`, `${B}/group1-shard2of2.bin`])
    expect(await modelCachedOffline('lemon-v1')).toBe(true)
  })
  it('false when a shard is missing', async () => {
    mockCaches([`${B}/model.json`, `${B}/metadata.json`, `${B}/group1-shard1of2.bin`])
    expect(await modelCachedOffline('lemon-v1')).toBe(false)
  })
})

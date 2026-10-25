import * as tf from '@tensorflow/tfjs-core'
import '@tensorflow/tfjs-backend-webgl'
import '@tensorflow/tfjs-backend-cpu'
import { loadGraphModel, type GraphModel } from '@tensorflow/tfjs-converter'
import { metadataUrl, modelUrl, type ModelId, type ModelMetadata } from './modelRegistry'
import { SUPPORTED_SIZES } from './preprocess'
import { verifiedFetch } from '../security/integrity'

export type ModelState =
  | { status: 'loading' }
  | { status: 'ready'; loadMs: number; selfTestMs: number }
  | { status: 'error'; message: string }

export interface LoadedModel {
  id: ModelId
  model: GraphModel
  meta: ModelMetadata
}

let backendReady: Promise<string> | null = null
export function initBackend(): Promise<string> {
  backendReady ??= (async () => {
    // setBackend resolves false (rather than throwing) when WebGL is unavailable
    const ok = await tf.setBackend('webgl').catch(() => false)
    if (!ok) await tf.setBackend('cpu')
    await tf.ready()
    return tf.getBackend()
  })()
  return backendReady
}

export function validateMetadata(meta: ModelMetadata, id: ModelId): void {
  if (meta.modelVersion !== id) throw new Error(`metadata is for ${meta.modelVersion}, expected ${id}`)
  if (!Array.isArray(meta.classes) || meta.classes.length !== meta.classCount)
    throw new Error(`class list length ${meta.classes?.length} != classCount ${meta.classCount}`)
  if (meta.inputSize[0] !== meta.inputSize[1] || !SUPPORTED_SIZES.includes(meta.inputSize[0])) throw new Error('unexpected input size')
  if (!meta.normalization?.inModel) throw new Error('model must contain its own normalization layer')
  if (!(meta.thresholds?.confidence > 0)) throw new Error('missing calibrated thresholds')
}

/** Deterministic self-test: shape, finiteness, softmax sum. Disposes tensors. */
export function selfTest(model: GraphModel, meta: ModelMetadata): void {
  const out = tf.tidy(() => {
    const n = meta.inputSize[0]
    const x = tf.fill([1, n, n, 3], 127.5)
    return model.predict(x) as tf.Tensor
  })
  try {
    if (out.shape.length !== 2 || out.shape[0] !== 1 || out.shape[1] !== meta.classCount)
      throw new Error(`output shape [${out.shape}] != [1,${meta.classCount}]`)
    const v = out.dataSync()
    let sum = 0
    for (const p of v) {
      if (!Number.isFinite(p)) throw new Error('non-finite output')
      sum += p
    }
    if (Math.abs(sum - 1) > 1e-3) throw new Error(`softmax sum ${sum.toFixed(4)} != 1`)
  } finally {
    out.dispose()
  }
}

export async function loadModel(id: ModelId): Promise<LoadedModel & { loadMs: number; selfTestMs: number }> {
  await initBackend()
  const t0 = performance.now()
  const res = await verifiedFetch(metadataUrl(id))
  if (!res.ok) throw new Error(`metadata ${res.status}`)
  const meta = (await res.json()) as ModelMetadata
  validateMetadata(meta, id)
  const model = await loadGraphModel(modelUrl(id), { fetchFunc: verifiedFetch })
  const loadMs = performance.now() - t0
  const t1 = performance.now()
  selfTest(model, meta)
  return { id, model, meta, loadMs, selfTestMs: performance.now() - t1 }
}

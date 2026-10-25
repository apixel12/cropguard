import * as tf from '@tensorflow/tfjs-core'
import { assess, type Assessment } from './confidence'
import type { LoadedModel } from './modelLoader'
import { toInputTensor } from './preprocess'

/** Same correction training's evaluate() applied before calibrating thresholds. */
export function applyPriorCorrection(p: ArrayLike<number>, pc?: { alpha: number; classWeights: number[] }): Float32Array {
  const q = Float32Array.from(p)
  if (!pc || !pc.alpha) return q
  let sum = 0
  for (let i = 0; i < q.length; i++) sum += (q[i] *= Math.pow(pc.classWeights[i], -pc.alpha))
  for (let i = 0; i < q.length; i++) q[i] /= sum
  return q
}

export interface Prediction extends Assessment {
  modelVersion: string
  inferenceMs: number
  frames?: number // how many images/frames were combined
  perImageTop?: string[] // each image's own top label (to spot photos that disagree)
  perImageConf?: number[] // ...and its probability
}

/** How several images are combined.
 * 'mean': video frames of one leaf (highly correlated; validated in training/video_eval.py).
 * 'geometric': separate photos of the same plant. Each photo is independent evidence, so a
 *   condition only scores high if every photo supports it. Chosen on validation over the
 *   arithmetic mean (answered far less often) and the full product (overconfident). */
export type Combine = 'mean' | 'geometric'

export type ImageSource = HTMLImageElement | HTMLCanvasElement

/** Class probabilities for one image, exactly as calibrated in training
 * (mirror test-time augmentation, then prior correction). */
export async function predictProbs(m: LoadedModel, img: ImageSource): Promise<Float32Array> {
  const input = toInputTensor(img, m.meta.inputSize[0]) // each model's own resolution
  let out: tf.Tensor | undefined
  try {
    // Test-time augmentation must match how thresholds were calibrated.
    out = tf.tidy(() => {
      const p = m.model.predict(input) as tf.Tensor
      if (m.meta.tta !== 'hflip') return p
      const flipped = m.model.predict(tf.reverse(input, 2)) as tf.Tensor
      return tf.div(tf.add(p, flipped), 2)
    })
    return applyPriorCorrection(await out.data(), m.meta.priorCorrection)
  } finally {
    input.dispose() // also when inference throws: no leaked GPU memory
    out?.dispose()
  }
}

/** Several photos that disagree can make a third condition win the combined score
 * (early blight + healthy -> "late blight"). So when the photos' own answers differ,
 * the combined answer is only named if it is the top answer of a majority of them.
 * On the crops test set this cut "named a condition shown in none of the photos"
 * from 2.7% to 0.2% of mixed groups. */
export function needsMajority(top: string, perImageTop: string[] | undefined): boolean {
  if (!perImageTop || perImageTop.length < 2 || new Set(perImageTop).size === 1) return false
  return perImageTop.filter((t) => t === top).length * 2 <= perImageTop.length
}

export const argmax = (p: ArrayLike<number>) => { let b = 0; for (let i = 1; i < p.length; i++) if (p[i] > p[b]) b = i; return b }

/** Combined class probabilities over one photo, several photos, or video frames. */
export async function meanProbs(m: LoadedModel, imgs: ImageSource | ImageSource[], combine: Combine = 'mean'):
  Promise<{ probs: Float32Array; inferenceMs: number; frames: number; perImage: Float32Array[] }> {
  const t0 = performance.now()
  const list = Array.isArray(imgs) ? imgs : [imgs]
  if (!list.length) throw new Error('No image to analyse.')
  const acc = new Float64Array(m.meta.classCount)
  const perImage: Float32Array[] = []
  for (const img of list) {
    const p = await predictProbs(m, img)
    perImage.push(p)
    for (let i = 0; i < acc.length; i++) acc[i] += combine === 'geometric' ? Math.log(Math.max(p[i], 1e-9)) / list.length : p[i] / list.length
  }
  const probs = new Float32Array(acc.length)
  if (combine === 'geometric') {
    const mx = Math.max(...acc)
    let sum = 0
    for (let i = 0; i < acc.length; i++) sum += (probs[i] = Math.exp(acc[i] - mx))
    for (let i = 0; i < acc.length; i++) probs[i] /= sum
  } else probs.set(acc)
  return { probs, inferenceMs: performance.now() - t0, frames: list.length, perImage }
}

/** Analyse one photo, or several frames of a video: per-frame probabilities
 * are averaged before the confidence decision, so one blurred frame can't
 * swing the result. */
export async function runModel(m: LoadedModel, imgs: ImageSource | ImageSource[], combine: Combine = 'mean'): Promise<Prediction> {
  const { probs, inferenceMs, frames, perImage } = await meanProbs(m, imgs, combine)
  const perImageTop = perImage.map((p) => m.meta.classes[argmax(p)])
  const perImageConf = perImage.map((p) => p[argmax(p)])
  const a = assess(probs, m.meta.classes, m.meta.thresholds, m.meta.classThresholds)
  const split = combine === 'geometric' && needsMajority(a.top[0].label, perImageTop)
  return { ...a, status: split ? 'uncertain' : a.status, modelVersion: m.meta.modelVersion, inferenceMs, frames, perImageTop, perImageConf }
}

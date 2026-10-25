import { argmax, meanProbs, needsMajority, type Combine, type ImageSource, type Prediction } from './classify'
import { assess } from './confidence'
import type { LoadedModel } from './modelLoader'

/** PlantVillage labels look like "Tomato___Late_blight". */
export const cropOf = (label: string) => label.split('___')[0]

export const PV_CROPS: { key: string; name: string }[] = [
  // garden favourites first (NGA survey), then the major field crops
  { key: 'Tomato', name: 'Tomato' },
  { key: 'Pepper,_bell', name: 'Bell pepper' },
  { key: 'Bean', name: 'Bean' },
  { key: 'Squash', name: 'Squash' },
  { key: 'Potato', name: 'Potato' },
  { key: 'Strawberry', name: 'Strawberry' },
  { key: 'Corn_(maize)', name: 'Corn' },
  { key: 'Wheat', name: 'Wheat' },
  { key: 'Rice', name: 'Rice' },
  { key: 'Soybean', name: 'Soybean' },
  { key: 'Cotton', name: 'Cotton' },
  { key: 'Sugarcane', name: 'Sugarcane' },
  { key: 'Cassava', name: 'Cassava' },
  { key: 'Grape', name: 'Grape' },
  { key: 'Apple', name: 'Apple' },
  { key: 'Peach', name: 'Peach' },
  { key: 'Cherry_(including_sour)', name: 'Cherry' },
  { key: 'Blueberry', name: 'Blueberry' },
  { key: 'Raspberry', name: 'Raspberry' },
  { key: 'Orange', name: 'Orange' },
]

export interface PVPrediction extends Prediction {
  cropMismatch: boolean
  cropMass: number // share of the model's probability on the identified crop
}

/** The model must put at least this share of its probability on the plant
 * that was identified before the result is scored within that plant.
 * Below it the leaf "doesn't look like" that plant, and the app says so. */
export const CROP_MASS_MIN = 0.2 // chosen on validation: precision is flat (96.7-96.8%) from 0 to 0.5; higher only refused more real-world photos

/** P(condition | image, plant): keep the identified plant's classes and
 * renormalise. The plant is already known (plant-identification model or the
 * user), so look-alikes on other crops (potato vs tomato late blight, corn vs
 * sugarcane) shouldn't compete. CROP_MASS_MIN stops this from inventing
 * confidence for a leaf the model thinks is something else. */
export function conditionOnCrop(probs: ArrayLike<number>, classes: string[], cropKey: string): { probs: Float32Array; cropMass: number } {
  const out = new Float32Array(probs.length)
  let mass = 0
  for (let i = 0; i < probs.length; i++) if (cropOf(classes[i]) === cropKey) mass += probs[i]
  if (mass > 0) for (let i = 0; i < probs.length; i++) if (cropOf(classes[i]) === cropKey) out[i] = probs[i] / mass
  return { probs: out, cropMass: mass }
}

export async function classifyPlantVillage(
  m: LoadedModel,
  img: ImageSource | ImageSource[],
  cropKey: string,
  combine: Combine = 'mean',
): Promise<PVPrediction> {
  if (m.id !== 'crops-v2') throw new Error('requires the crops model')
  const { probs, inferenceMs, frames, perImage } = await meanProbs(m, img, combine)
  // each photo's own answer within the identified plant (to spot photos that disagree)
  const perImageCond = perImage.map((p) => conditionOnCrop(p, m.meta.classes, cropKey).probs)
  const perImageTop = perImageCond.map((p) => m.meta.classes[argmax(p)])
  const perImageConf = perImageCond.map((p) => p[argmax(p)])
  const { probs: cond, cropMass } = conditionOnCrop(probs, m.meta.classes, cropKey)
  const cropMismatch = cropMass < CROP_MASS_MIN
  const a = assess(cropMismatch ? probs : cond, m.meta.classes, undefined, m.meta.classThresholds)
  const split = combine === 'geometric' && needsMajority(a.top[0].label, perImageTop)
  return { ...a, status: cropMismatch || split ? 'uncertain' : a.status, cropMismatch, cropMass, modelVersion: m.meta.modelVersion, inferenceMs, frames, perImageTop, perImageConf }
}

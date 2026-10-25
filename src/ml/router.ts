import { runModel, type Combine, type ImageSource, type Prediction } from './classify'
import type { LoadedModel } from './modelLoader'
import { PV_CROPS } from './plantVillageClassifier'

/** Which disease model to run for a plant. */
export type Plant = { kind: 'lemon' } | { kind: 'pv'; cropKey: string; cropName: string }

export const LEMON: Plant = { kind: 'lemon' }

/** Router class names ("Lemon", "Bell pepper", …) → disease-model routing. */
export function plantFromName(name: string): Plant | null {
  if (name === 'Lemon') return LEMON
  const c = PV_CROPS.find((p) => p.name.toLowerCase() === name.toLowerCase())
  return c ? { kind: 'pv', cropKey: c.key, cropName: c.name } : null
}

export const plantName = (p: Plant) => (p.kind === 'lemon' ? 'Lemon' : p.cropName)

export interface Identification extends Prediction {
  plant: Plant | null // null when not confident: ask the user
  suggestions: Plant[] // the router's top guesses, best first
}

export async function identifyPlant(m: LoadedModel, img: ImageSource | ImageSource[], combine: Combine = 'mean'): Promise<Identification> {
  if (m.id !== 'router-v2') throw new Error('requires the plant-identification model')
  const p = await runModel(m, img, combine)
  const suggestions = p.top.map((t) => plantFromName(t.label)).filter((x): x is Plant => !!x)
  return { ...p, plant: p.status === 'confident' ? suggestions[0] ?? null : null, suggestions }
}

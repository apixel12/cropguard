export type ModelId = 'router-v2' | 'lemon-v1' | 'crops-v2'

export interface Thresholds {
  confidence: number
  margin: number
  coverage?: number
  precisionAccepted?: number
  testCoverage?: number
  testPrecisionAccepted?: number
  calibratedOn?: string
}

/** Held-out test behaviour under the app's own answer rule (top-1 >= cutoff). */
export interface AppRule {
  cutoff: number
  rule?: string
  accuracy?: number
  coverage: number
  precision: number
}

export interface ModelMetadata {
  modelVersion: ModelId
  architecture: string
  format: 'tfjs_graph_model'
  inputSize: [number, number]
  inputShape: [number, number, number, number]
  colorMode: 'RGB'
  dataset: string
  classCount: number
  classes: string[]
  normalization: { inputRange: [number, number]; inModel: boolean; formula: string; resize: string }
  trainingDate: string
  thresholds: Thresholds
  metrics: Record<string, number | string | AppRule | undefined> & { appRule?: AppRule }
  license: string
  /** test-time augmentation used when calibrating thresholds */
  tta?: 'hflip'
  /** logit adjustment for class-weighted training, applied after softmax */
  priorCorrection?: { alpha: number; classWeights: number[] }
  /** per-condition cut-offs (>= the app cutoff), calibrated on validation for 90% precision; >1 means never named */
  classThresholds?: Record<string, number>
}

export const MODELS: Record<ModelId, { label: string; base: string }> = {
  'router-v2': { label: 'Plant identification', base: '/models/router-v2' },
  'lemon-v1': { label: 'Lemon', base: '/models/lemon-v1' },
  'crops-v2': { label: 'Crops', base: '/models/crops-v2' },
}

export const modelUrl = (id: ModelId) => `${MODELS[id].base}/model.json`
export const metadataUrl = (id: ModelId) => `${MODELS[id].base}/metadata.json`

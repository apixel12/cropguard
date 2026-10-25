import type { Thresholds } from './modelRegistry'

export interface Ranked {
  index: number
  label: string
  confidence: number
}

export interface Assessment {
  status: 'confident' | 'uncertain'
  top: Ranked[] // top-3
  margin: number
  cutoff: number // the bar the top class had to clear
}

/** A result is named when its top class is at or above this probability. */
export const CONFIDENCE_CUTOFF = 0.7

/** Softmax confidence is NOT probability of correctness. A result is named when
 * its top class reaches 70%, or that condition's own higher cut-off: conditions
 * that were less reliable on validation data (e.g. healthy cassava) must clear a
 * higher bar, so the app doesn't give false reassurance. */
export function assess(probs: ArrayLike<number>, classes: string[], _t?: Thresholds, classCutoffs?: Record<string, number>): Assessment {
  const ranked = Array.from(probs, (p, i) => ({ index: i, label: classes[i], confidence: p }))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3)
  const margin = ranked[0].confidence - (ranked[1]?.confidence ?? 0)
  const cutoff = Math.max(CONFIDENCE_CUTOFF, classCutoffs?.[ranked[0].label] ?? 0)
  const ok = ranked[0].confidence >= cutoff
  return { status: ok ? 'confident' : 'uncertain', top: ranked, margin, cutoff }
}

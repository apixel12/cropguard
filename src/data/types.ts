export type Severity = 'none' | 'low' | 'moderate' | 'high' | 'regulated'

export interface ConditionInfo {
  name: string
  crop: string
  shortDescription: string
  visualSigns: string[]
  generalNextSteps: string[]
  severity: Severity
  disclaimer: string
  note?: string
}

export const DISCLAIMER =
  'This is an AI screening result, not a professional diagnosis. Confirm with a local agricultural extension service or plant specialist.'

export const CONFIRM_STEP =
  'Have the result confirmed by a local agricultural extension office (e.g. UC Master Gardeners / UCCE in California) or a plant specialist before acting.'

/** Normalises dataset folder names ("Citrus_Canker", "citrus canker") to one key. */
export const keyOf = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

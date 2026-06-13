import type { Cr871_responses } from "@/generated/models/Cr871_responsesModel"

// Maturity level numeric codes (from Cr871_responsescr871_maturitylevel)
const FULLY_IMPLEMENTED = 144610000
const PARTIAL_IN_PROGRESS = 144610001

export interface BandThresholds {
  lowMin: number
  medMin: number
  highMin: number
}

export const DEFAULT_THRESHOLDS: BandThresholds = {
  lowMin: 80,
  medMin: 60,
  highMin: 40,
}

export type RiskBand = "LowRisk" | "MediumRisk" | "HighRisk" | "CriticalRisk"

export function computeScore(
  responses: Pick<Cr871_responses, "cr871_iscovered" | "cr871_maturitylevel">[]
): number {
  const applicable = responses.filter(r => r.cr871_iscovered !== true)
  const total = applicable.length
  if (total === 0) return 0
  const fully = applicable.filter(
    r => (r.cr871_maturitylevel as unknown as number) === FULLY_IMPLEMENTED
  ).length
  const partial = applicable.filter(
    r => (r.cr871_maturitylevel as unknown as number) === PARTIAL_IN_PROGRESS
  ).length
  return ((fully + 0.5 * partial) / total) * 100
}

export function getRiskBand(score: number, thresholds: BandThresholds): RiskBand {
  if (score >= thresholds.lowMin) return "LowRisk"
  if (score >= thresholds.medMin) return "MediumRisk"
  if (score >= thresholds.highMin) return "HighRisk"
  return "CriticalRisk"
}

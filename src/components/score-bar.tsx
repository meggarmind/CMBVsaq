import { cn } from "@/lib/utils"
import { Progress } from "@/components/ui/progress"
import { RISK_BAND_BAR_COLOR } from "@/lib/labels"
import { getRiskBand, DEFAULT_THRESHOLDS, type BandThresholds } from "@/lib/scoring"

const BAND_CODE: Record<string, number> = {
  LowRisk: 144610000,
  MediumRisk: 144610001,
  HighRisk: 144610002,
  CriticalRisk: 144610003,
}

interface ScoreBarProps {
  score?: number | null
  thresholds?: BandThresholds
  showPercent?: boolean
  className?: string
}

export function ScoreBar({ score, thresholds = DEFAULT_THRESHOLDS, showPercent = true, className }: ScoreBarProps) {
  if (score === undefined || score === null) {
    return <span className="text-sm text-muted-foreground">—</span>
  }

  const band = getRiskBand(score, thresholds)
  const bandCode = BAND_CODE[band]
  const barColor = RISK_BAND_BAR_COLOR[bandCode]

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Progress
        value={score}
        className="h-2 w-20 bg-muted"
        indicatorClassName={barColor}
      />
      {showPercent && (
        <span className="text-sm tabular-nums">{Math.round(score)}%</span>
      )}
    </div>
  )
}

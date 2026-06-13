import { cn } from "@/lib/utils"
import { RISK_BAND_COLOR, RISK_BAND_LABEL } from "@/lib/labels"

interface RiskBadgeProps {
  code?: number | null
  label?: string
  className?: string
}

export function RiskBadge({ code, label, className }: RiskBadgeProps) {
  const display = label ?? (code !== undefined && code !== null ? RISK_BAND_LABEL[code] : null) ?? "—"
  const colorClass = code !== undefined && code !== null ? RISK_BAND_COLOR[code] : "bg-gray-100 text-gray-500"

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        colorClass,
        className
      )}
    >
      {display}
    </span>
  )
}

// Display labels and Tailwind color classes for all Dataverse enums

export const RISK_BAND_LABEL: Record<number, string> = {
  144610000: "Low Risk",
  144610001: "Medium Risk",
  144610002: "High Risk",
  144610003: "Critical Risk",
}

// Returns className strings for shadcn Badge (outline style override)
export const RISK_BAND_COLOR: Record<number, string> = {
  144610000: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-green-300 dark:border-green-700",
  144610001: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-700",
  144610002: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 border-orange-300 dark:border-orange-700",
  144610003: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 border-red-300 dark:border-red-700",
}

// Progress bar fill color for risk bands (Tailwind bg- classes)
export const RISK_BAND_BAR_COLOR: Record<number, string> = {
  144610000: "bg-green-500",
  144610001: "bg-amber-500",
  144610002: "bg-orange-500",
  144610003: "bg-red-500",
}

// Vendor risk rating (cr871_currentriskrating / cr871_riskrating)
export const RISK_RATING_LABEL: Record<number, string> = {
  144610000: "Critical",
  144610001: "High",
  144610002: "Medium",
  144610003: "Low",
}

// Assessment status
export const ASSESSMENT_STATUS_LABEL: Record<number, string> = {
  144610000: "Invited",
  144610001: "In Progress",
  144610002: "Submitted",
  144610003: "Under Review",
  144610004: "Complete",
  144610005: "Lapsed",
}

export const ASSESSMENT_STATUS_COLOR: Record<number, string> = {
  144610000: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  144610001: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  144610002: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  144610003: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  144610004: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  144610005: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
}

// Final decision
export const FINAL_DECISION_LABEL: Record<number, string> = {
  144610000: "Approved",
  144610001: "Approved with Conditions",
  144610002: "Deferred",
  144610003: "Rejected",
}

export const FINAL_DECISION_COLOR: Record<number, string> = {
  144610000: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  144610001: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  144610002: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  144610003: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
}

// Maturity level
export const MATURITY_LABEL: Record<number, string> = {
  144610000: "Fully Implemented",
  144610001: "Partial / In Progress",
  144610002: "Not Implemented",
  144610003: "Not Applicable",
  144610004: "Not Answered",
}

export const MATURITY_COLOR: Record<number, string> = {
  144610000: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  144610001: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  144610002: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  144610003: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  144610004: "bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500",
}

// Vendor status
export const VENDOR_STATUS_LABEL: Record<number, string> = {
  144610000: "Active",
  144610001: "Inactive",
  144610002: "Offboarded",
}

export function formatDate(iso?: string): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

export function formatScore(score?: number): string {
  if (score === undefined || score === null) return "—"
  return `${Math.round(score)}%`
}

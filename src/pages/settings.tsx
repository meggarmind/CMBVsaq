import { useNavigate } from "react-router-dom"
import { useEffect } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuthStore } from "@/stores/auth-store"
import { useSettingsStore } from "@/stores/settings-store"

const SETTING_DEFS: { key: string; label: string; description: string; type?: "textarea" }[] = [
  { key: "RiskBand_LowRisk_Min", label: "Low Risk Minimum Score", description: "Minimum score (0–100) to be classified as Low Risk. Default: 80" },
  { key: "RiskBand_MediumRisk_Min", label: "Medium Risk Minimum Score", description: "Minimum score to be classified as Medium Risk. Default: 60" },
  { key: "RiskBand_HighRisk_Min", label: "High Risk Minimum Score", description: "Minimum score to be classified as High Risk. Default: 40. Below this threshold = Critical Risk." },
  { key: "AssessFreq_Critical_Months", label: "Critical Vendor Assessment Frequency (months)", description: "How often Critical-rated vendors should be reassessed. Default: 6" },
  { key: "AssessFreq_High_Months", label: "High Vendor Assessment Frequency (months)", description: "How often High-rated vendors should be reassessed. Default: 12" },
  { key: "AssessFreq_Medium", label: "Medium Vendor Assessment Frequency", description: "Assessment frequency for Medium-rated vendors. Default: AdHoc" },
  { key: "AssessFreq_Low", label: "Low Vendor Assessment Frequency", description: "Assessment frequency for Low-rated vendors. Default: AdHoc" },
  { key: "Reminder_DaysBefore", label: "Reminder Days Before Due", description: "How many days before the due date to send the first reminder. Default: 7" },
  { key: "Reminder_MaxCount", label: "Max Reminder Count", description: "Maximum number of reminder emails to send per assessment. Default: 3" },
  { key: "Reminder_IntervalDays", label: "Reminder Interval (days)", description: "Days between reminder emails. Default: 7" },
  { key: "Email_Invite_Body", label: "Invite Email Body", description: "Template for the invitation email sent to vendors. Use {VendorName}, {AssessmentLink}, {DueDate} as placeholders.", type: "textarea" },
  { key: "Email_Reminder_Body", label: "Reminder Email Body", description: "Template for reminder emails. Use {VendorName}, {AssessmentLink}, {DueDate}.", type: "textarea" },
  { key: "Email_Submission_Body", label: "Submission Confirmation Body", description: "Email sent to vendor on successful submission. Use {VendorName}, {AssessmentID}.", type: "textarea" },
  { key: "Admin_AlertEmail", label: "Admin Alert Email", description: "Email address to notify when an assessment is submitted for review." },
]

export default function SettingsPage() {
  const navigate = useNavigate()
  const role = useAuthStore(s => s.role)
  const loading = useAuthStore(s => s.loading)
  const settingsStore = useSettingsStore()

  useEffect(() => {
    if (!loading && role !== "CISO") {
      navigate("/dashboard", { replace: true })
    }
  }, [role, loading, navigate])

  async function handleBlur(key: string, value: string) {
    try {
      await settingsStore.save(key, value)
      toast.success("Setting saved.")
    } catch {
      toast.error("Failed to save setting.")
    }
  }

  if (settingsStore.loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-80 w-full" />
      </div>
    )
  }

  const riskBandSettings = SETTING_DEFS.slice(0, 3)
  const assessFreqSettings = SETTING_DEFS.slice(3, 7)
  const reminderSettings = SETTING_DEFS.slice(7, 10)
  const emailSettings = SETTING_DEFS.slice(10)

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      <SettingsGroup title="Risk Band Thresholds" defs={riskBandSettings} store={settingsStore} onBlur={handleBlur} />
      <SettingsGroup title="Assessment Frequency" defs={assessFreqSettings} store={settingsStore} onBlur={handleBlur} />
      <SettingsGroup title="Reminders" defs={reminderSettings} store={settingsStore} onBlur={handleBlur} />
      <SettingsGroup title="Email Templates" defs={emailSettings} store={settingsStore} onBlur={handleBlur} />
    </div>
  )
}

function SettingsGroup({
  title, defs, store, onBlur,
}: {
  title: string
  defs: typeof SETTING_DEFS
  store: { get: (key: string) => string }
  onBlur: (key: string, value: string) => void
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {defs.map(({ key, label, description, type }) => (
          <div key={key} className="space-y-1.5">
            <label className="text-sm font-medium">{label}</label>
            <p className="text-xs text-muted-foreground">{description}</p>
            {type === "textarea" ? (
              <Textarea
                defaultValue={store.get(key)}
                rows={4}
                onBlur={e => onBlur(key, e.target.value)}
                className="font-mono text-xs"
              />
            ) : (
              <Input
                defaultValue={store.get(key)}
                onBlur={e => onBlur(key, e.target.value)}
                className="max-w-xs"
              />
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

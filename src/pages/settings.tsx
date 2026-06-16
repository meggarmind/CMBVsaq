import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Trash2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuthStore } from "@/stores/auth-store"
import { useSettingsStore } from "@/stores/settings-store"
import { Cr871_appusersService } from "@/generated/services/Cr871_appusersService"
import type { Cr871_appusers } from "@/generated/models/Cr871_appusersModel"

interface SettingDef {
  key: string
  label: string
  description: string
  type?: "textarea"
  mergeTags?: string[]
}

const SETTING_DEFS: SettingDef[] = [
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
  { key: "Email_Invite_Body", label: "Invite Email Body", description: "Template for the invitation email sent to vendors.", type: "textarea", mergeTags: ["{VendorName}", "{AssessmentID}", "{DueDate}", "{AppURL}"] },
  { key: "Email_Reminder_Body", label: "Reminder Email Body", description: "Template for reminder emails.", type: "textarea", mergeTags: ["{VendorName}", "{AssessmentID}", "{DueDate}", "{AppURL}"] },
  { key: "Email_Submission_Body", label: "Submission Confirmation Body", description: "Email sent to vendor on successful submission.", type: "textarea", mergeTags: ["{VendorName}", "{AssessmentID}", "{DueDate}", "{AppURL}"] },
  { key: "Admin_AlertEmail", label: "Admin Alert Email", description: "Email address to notify when an assessment is submitted for review." },
]

const riskBandSettings = SETTING_DEFS.slice(0, 3)
const freqSettings     = SETTING_DEFS.slice(3, 7)
const reminderSettings = SETTING_DEFS.slice(7, 10)
const emailSettings    = SETTING_DEFS.slice(10)

const ROLE_LABEL: Record<number, string> = { 144610000: "CISO", 144610001: "Assessor" }

export default function SettingsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const role = useAuthStore(s => s.role)
  const loading = useAuthStore(s => s.loading)
  const settingsStore = useSettingsStore()

  useEffect(() => {
    if (!loading && role !== "CISO") {
      navigate("/dashboard", { replace: true })
    }
  }, [role, loading, navigate])

  const [riskValues, setRiskValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(riskBandSettings.map(d => [d.key, settingsStore.get(d.key)]))
  )
  const [freqValues, setFreqValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(freqSettings.map(d => [d.key, settingsStore.get(d.key)]))
  )
  const [reminderValues, setReminderValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(reminderSettings.map(d => [d.key, settingsStore.get(d.key)]))
  )
  const [emailValues, setEmailValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(emailSettings.map(d => [d.key, settingsStore.get(d.key)]))
  )
  const [savingPanel, setSavingPanel] = useState<string | null>(null)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!settingsStore.loading) {
      setRiskValues(Object.fromEntries(riskBandSettings.map(d => [d.key, settingsStore.get(d.key)])))
      setFreqValues(Object.fromEntries(freqSettings.map(d => [d.key, settingsStore.get(d.key)])))
      setReminderValues(Object.fromEntries(reminderSettings.map(d => [d.key, settingsStore.get(d.key)])))
      setEmailValues(Object.fromEntries(emailSettings.map(d => [d.key, settingsStore.get(d.key)])))
    }
  }, [settingsStore.loading])

  const { data: usersResult, isLoading: usersLoading } = useQuery({
    queryKey: ["cr871_appusers"],
    queryFn: () => Cr871_appusersService.getAll({
      filter: "statecode eq 0",
      orderBy: ["cr871_name asc"],
    }),
  })
  const appUsers: Cr871_appusers[] = usersResult?.data ?? []

  const [newUser, setNewUser] = useState({ name: "", email: "", role: "" })
  const [addingUser, setAddingUser] = useState(false)
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null)

  async function savePanel(panelId: string, defs: SettingDef[], values: Record<string, string>) {
    setSavingPanel(panelId)
    try {
      await Promise.all(defs.map(d => settingsStore.save(d.key, values[d.key] ?? "")))
      toast.success("Settings saved.")
    } catch {
      toast.error("Failed to save settings.")
    }
    setSavingPanel(null)
  }

  async function handleAddUser() {
    if (!newUser.name || !newUser.email || !newUser.role) return
    setAddingUser(true)
    try {
      await Cr871_appusersService.create({
        cr871_name: newUser.name,
        cr871_email: newUser.email,
        cr871_role: Number(newUser.role) as 144610000 | 144610001,
        ownerid: "",
        owneridtype: "systemusers",
        statecode: 0,
      })
      await queryClient.invalidateQueries({ queryKey: ["cr871_appusers"] })
      setNewUser({ name: "", email: "", role: "" })
      toast.success("User added.")
    } catch {
      toast.error("Failed to add user.")
    }
    setAddingUser(false)
  }

  async function handleDeleteUser(id: string) {
    if (!window.confirm("Remove this user? They will lose access on their next login.")) return
    setDeletingUserId(id)
    try {
      await Cr871_appusersService.delete(id)
      await queryClient.invalidateQueries({ queryKey: ["cr871_appusers"] })
      toast.success("User removed.")
    } catch {
      toast.error("Failed to remove user.")
    }
    setDeletingUserId(null)
  }

  if (settingsStore.loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-80 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      <SettingsPanel
        panelId="risk"
        title="Risk Band Thresholds"
        defs={riskBandSettings}
        values={riskValues}
        onChange={(k, v) => setRiskValues(prev => ({ ...prev, [k]: v }))}
        onSave={() => void savePanel("risk", riskBandSettings, riskValues)}
        saving={savingPanel === "risk"}
      />
      <SettingsPanel
        panelId="freq"
        title="Assessment Frequency"
        defs={freqSettings}
        values={freqValues}
        onChange={(k, v) => setFreqValues(prev => ({ ...prev, [k]: v }))}
        onSave={() => void savePanel("freq", freqSettings, freqValues)}
        saving={savingPanel === "freq"}
      />
      <SettingsPanel
        panelId="reminder"
        title="Reminders"
        defs={reminderSettings}
        values={reminderValues}
        onChange={(k, v) => setReminderValues(prev => ({ ...prev, [k]: v }))}
        onSave={() => void savePanel("reminder", reminderSettings, reminderValues)}
        saving={savingPanel === "reminder"}
      />
      <SettingsPanel
        panelId="email"
        title="Email Templates"
        defs={emailSettings}
        values={emailValues}
        onChange={(k, v) => setEmailValues(prev => ({ ...prev, [k]: v }))}
        onSave={() => void savePanel("email", emailSettings, emailValues)}
        saving={savingPanel === "email"}
      />

      {/* App Users */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">App Users</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="border-b">
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Name</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Email</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Role</th>
                  <th className="w-10" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {usersLoading
                  ? Array(3).fill(null).map((_, i) => (
                      <tr key={i} className="border-b">
                        {[1, 2, 3, 4].map(j => (
                          <td key={j} className="px-3 py-2">
                            <Skeleton className="h-4 w-full" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : appUsers.length === 0
                    ? (
                        <tr>
                          <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground text-sm">
                            No users found.
                          </td>
                        </tr>
                      )
                    : appUsers.map(u => (
                        <tr key={u.cr871_appuserid} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="px-3 py-2">{u.cr871_name ?? "—"}</td>
                          <td className="px-3 py-2 text-muted-foreground">{u.cr871_email ?? "—"}</td>
                          <td className="px-3 py-2">
                            <span className="text-xs font-medium">
                              {ROLE_LABEL[u.cr871_role as unknown as number] ?? "—"}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={deletingUserId === u.cr871_appuserid}
                              onClick={() => void handleDeleteUser(u.cr871_appuserid)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </td>
                        </tr>
                      ))
                }
              </tbody>
            </table>
          </div>

          <div className="flex gap-2 items-end pt-1">
            <div className="space-y-1">
              <label className="text-xs font-medium">Name</label>
              <Input
                value={newUser.name}
                onChange={e => setNewUser(u => ({ ...u, name: e.target.value }))}
                placeholder="Full name"
                className="w-40"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Email</label>
              <Input
                value={newUser.email}
                onChange={e => setNewUser(u => ({ ...u, email: e.target.value }))}
                placeholder="user@example.com"
                className="w-52"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Role</label>
              <Select value={newUser.role} onValueChange={v => setNewUser(u => ({ ...u, role: v }))}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="144610000">CISO</SelectItem>
                  <SelectItem value="144610001">Assessor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={() => void handleAddUser()}
              disabled={addingUser || !newUser.name || !newUser.email || !newUser.role}
              size="sm"
            >
              {addingUser ? "Adding…" : "Add User"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function SettingsPanel({
  panelId: _panelId, title, defs, values, onChange, onSave, saving,
}: {
  panelId: string
  title: string
  defs: SettingDef[]
  values: Record<string, string>
  onChange: (key: string, value: string) => void
  onSave: () => void
  saving: boolean
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {defs.map(({ key, label, description, type, mergeTags }) => (
          <div key={key} className="space-y-1.5">
            <label className="text-sm font-medium">{label}</label>
            <p className="text-xs text-muted-foreground">{description}</p>
            {type === "textarea" ? (
              <Textarea
                value={values[key] ?? ""}
                onChange={e => onChange(key, e.target.value)}
                rows={4}
                className="font-mono text-xs"
              />
            ) : (
              <Input
                value={values[key] ?? ""}
                onChange={e => onChange(key, e.target.value)}
                className="max-w-xs"
              />
            )}
            {mergeTags && (
              <p className="text-xs text-muted-foreground">
                Tags:{" "}
                {mergeTags.map(t => (
                  <code key={t} className="font-mono bg-muted px-1 rounded text-xs mr-1">{t}</code>
                ))}
              </p>
            )}
          </div>
        ))}
      </CardContent>
      <CardFooter className="border-t pt-4">
        <Button size="sm" onClick={onSave} disabled={saving}>
          {saving ? "Saving…" : "Save All"}
        </Button>
      </CardFooter>
    </Card>
  )
}

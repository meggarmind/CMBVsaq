import { useState, useEffect, useRef } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Progress } from "@/components/ui/progress"
import { RiskBadge } from "@/components/risk-badge"
import { ScoreBar } from "@/components/score-bar"
import { Cr871_assessmentsService } from "@/generated/services/Cr871_assessmentsService"
import { Cr871_responsesService } from "@/generated/services/Cr871_responsesService"
import { Cr871_questionsService } from "@/generated/services/Cr871_questionsService"
import type { Cr871_responses } from "@/generated/models/Cr871_responsesModel"
import type { Cr871_questions } from "@/generated/models/Cr871_questionsModel"
import {
  ASSESSMENT_STATUS_LABEL, ASSESSMENT_STATUS_COLOR, FINAL_DECISION_LABEL,
  MATURITY_LABEL, MATURITY_COLOR, RISK_RATING_LABEL, formatDate,
} from "@/lib/labels"
import { computeScore, getRiskBand, DEFAULT_THRESHOLDS } from "@/lib/scoring"
import { useAuthStore } from "@/stores/auth-store"
import { useSettingsStore } from "@/stores/settings-store"
import { cn } from "@/lib/utils"

const BAND_CODE: Record<string, number> = {
  LowRisk: 144610000, MediumRisk: 144610001, HighRisk: 144610002, CriticalRisk: 144610003,
}
const RATING_BAND_MAP: Record<number, number> = {
  144610000: 144610003,
  144610001: 144610002,
  144610002: 144610001,
  144610003: 144610000,
}
const FINAL_DECISION_OPTIONS = Object.entries(FINAL_DECISION_LABEL).map(([code, label]) => ({ value: code, label }))

type QuestionMap = Map<string, Cr871_questions>
type SectionStats = { section: string; fi: number; partial: number; ni: number; total: number }

function getQid(r: Cr871_responses): string {
  return ((r as unknown as Record<string, unknown>)["_cr871_questionid_value"] as string | undefined) ?? ""
}

function computeSectionStats(responses: Cr871_responses[], questions: QuestionMap): SectionStats[] {
  const map: Record<string, SectionStats> = {}
  for (const r of responses) {
    const q = questions.get(getQid(r))
    const section = q?.cr871_sectionid ?? r.cr871_sectionid ?? "General"
    if (!map[section]) map[section] = { section, fi: 0, partial: 0, ni: 0, total: 0 }
    const code = r.cr871_maturitylevel as unknown as number
    if (code === 144610000) { map[section].fi++; map[section].total++ }
    else if (code === 144610001) { map[section].partial++; map[section].total++ }
    else if (code === 144610002) { map[section].ni++; map[section].total++ }
  }
  return Object.values(map).sort((a, b) => a.section.localeCompare(b.section))
}

function groupBySection(responses: Cr871_responses[], questions: QuestionMap) {
  const sections: Record<string, Record<string, Cr871_responses[]>> = {}
  for (const r of responses) {
    const q = questions.get(getQid(r))
    const section = q?.cr871_sectionid ?? r.cr871_sectionid ?? "General"
    const subsection = q?.cr871_subsectionid ?? "General"
    if (!sections[section]) sections[section] = {}
    if (!sections[section][subsection]) sections[section][subsection] = []
    sections[section][subsection].push(r)
  }
  return sections
}

async function triggerFlow(url: string, assessmentId: string) {
  if (!url) return
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assessmentId }),
    })
  } catch { /* best-effort */ }
}

function MetaField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <div className="text-sm font-medium">{children}</div>
    </div>
  )
}

export default function AssessmentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const role = useAuthStore(s => s.role)
  const email = useAuthStore(s => s.email)
  const settingsStore = useSettingsStore()
  const thresholds = {
    lowMin: settingsStore.getNumber("RiskBand_LowRisk_Min", DEFAULT_THRESHOLDS.lowMin),
    medMin: settingsStore.getNumber("RiskBand_MediumRisk_Min", DEFAULT_THRESHOLDS.medMin),
    highMin: settingsStore.getNumber("RiskBand_HighRisk_Min", DEFAULT_THRESHOLDS.highMin),
  }

  const [notes, setNotes] = useState("")
  const [decision, setDecision] = useState("")
  const [savingNotes, setSavingNotes] = useState(false)
  const [savingDecision, setSavingDecision] = useState(false)
  const initialized = useRef(false)

  const { data: assessmentResult, isLoading: assessmentLoading } = useQuery({
    queryKey: ["cr871_assessments", id],
    queryFn: () => Cr871_assessmentsService.get(id!),
    enabled: !!id,
  })

  const { data: responsesResult, isLoading: responsesLoading } = useQuery({
    queryKey: ["cr871_responses", "assessment", id],
    queryFn: () => Cr871_responsesService.getAll({
      filter: `_cr871_assessmentid_value eq '${id}'`,
    }),
    enabled: !!id,
  })

  const { data: questionsResult } = useQuery({
    queryKey: ["cr871_questions", "active"],
    queryFn: () => Cr871_questionsService.getAll({ filter: "statecode eq 0" }),
  })

  const assessment = assessmentResult?.data
  const responses = responsesResult?.data ?? []
  const questionsMap: QuestionMap = new Map(
    (questionsResult?.data ?? []).map((q: Cr871_questions) => [q.cr871_questionid, q])
  )

  useEffect(() => {
    if (!assessment || initialized.current) return
    initialized.current = true
    if (assessment.cr871_assessornotes) setNotes(assessment.cr871_assessornotes)
    if (assessment.cr871_finaldecision !== undefined)
      setDecision(String(assessment.cr871_finaldecision as unknown as number))
  }, [assessment])

  const liveScore = computeScore(responses)
  const liveBand = getRiskBand(liveScore, thresholds)
  const liveBandCode = BAND_CODE[liveBand]

  const sectionStats = computeSectionStats(responses, questionsMap)
  const grouped = groupBySection(responses, questionsMap)
  const sections = Object.keys(grouped).sort()

  const statusCode = assessment?.cr871_status as unknown as number
  const ratingCode = assessment?.cr871_riskrating as unknown as number
  const bandCode = assessment?.cr871_riskband as unknown as number

  const canAct =
    role === "CISO" ||
    (role === "Assessor" &&
      !!assessment?.cr871_assessoremail &&
      assessment.cr871_assessoremail.toLowerCase() === (email ?? "").toLowerCase())

  async function handleSaveNotes() {
    if (!id) return
    setSavingNotes(true)
    try {
      await Cr871_assessmentsService.update(id, { cr871_assessornotes: notes || undefined })
      toast.success("Notes saved.")
      await queryClient.invalidateQueries({ queryKey: ["cr871_assessments", id] })
    } catch {
      toast.error("Failed to save notes.")
    } finally {
      setSavingNotes(false)
    }
  }

  async function handleSaveDecision() {
    if (!id || !decision) { toast.error("Please select a decision."); return }
    setSavingDecision(true)
    try {
      await Cr871_assessmentsService.update(id, {
        cr871_finaldecision: Number(decision) as never,
        cr871_status: 144610004 as never,
        cr871_overallscore: liveScore,
        cr871_riskband: liveBandCode as never,
      })
      toast.success("Assessment completed.")
      await queryClient.invalidateQueries({ queryKey: ["cr871_assessments", id] })
    } catch {
      toast.error("Failed to save decision.")
    } finally {
      setSavingDecision(false)
    }
  }

  if (assessmentLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="flex gap-6">
          <div className="w-[380px] space-y-4">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
          <div className="flex-1 space-y-3">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        </div>
      </div>
    )
  }

  if (!assessment) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/assessments")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Assessments
        </Button>
        <p className="text-muted-foreground">Assessment not found.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={() => navigate("/assessments")}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Assessments
      </Button>

      <div className="flex gap-6 items-start">
        {/* ── Left panel ── */}
        <div className="w-[380px] shrink-0 space-y-4">

          {/* Metadata */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-lg leading-tight">
                  {assessment.cr871_vendorname ?? "Assessment"}
                </CardTitle>
                <span className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium shrink-0",
                  ASSESSMENT_STATUS_COLOR[statusCode] ?? ""
                )}>
                  {ASSESSMENT_STATUS_LABEL[statusCode] ?? "—"}
                </span>
              </div>
              {assessment.cr871_assessmentid1 && (
                <p className="text-xs text-muted-foreground font-mono mt-0.5">
                  {assessment.cr871_assessmentid1}
                </p>
              )}
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <MetaField label="Risk Rating">
                <RiskBadge code={RATING_BAND_MAP[ratingCode]} label={RISK_RATING_LABEL[ratingCode] ?? "—"} />
              </MetaField>
              <MetaField label="Risk Band">
                <RiskBadge code={bandCode} />
              </MetaField>
              <MetaField label="Overall Score">
                {responses.length > 0
                  ? <ScoreBar score={liveScore} thresholds={thresholds} />
                  : <span className="text-muted-foreground text-sm">—</span>}
              </MetaField>
              <MetaField label="Submit Date">{formatDate(assessment.cr871_submitdate)}</MetaField>
              <MetaField label="Due Date">{formatDate(assessment.cr871_duedate)}</MetaField>
              <MetaField label="Assessor Email">
                <span className="break-all text-sm font-medium">{assessment.cr871_assessoremail ?? "—"}</span>
              </MetaField>
              {assessment.cr871_vendorcontactemail && (
                <MetaField label="Vendor Contact">
                  <span className="break-all text-sm font-medium">{assessment.cr871_vendorcontactemail}</span>
                </MetaField>
              )}
            </CardContent>
          </Card>

          {/* Section Breakdown */}
          {sectionStats.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Section Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Section</th>
                      <th className="px-2 py-2 text-center font-medium text-green-700 dark:text-green-400">FI</th>
                      <th className="px-2 py-2 text-center font-medium text-amber-600 dark:text-amber-400">Partial</th>
                      <th className="px-2 py-2 text-center font-medium text-red-600 dark:text-red-400">NI</th>
                      <th className="px-4 py-2 font-medium text-muted-foreground">Progress</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sectionStats.map(s => {
                      const pct = s.total > 0 ? Math.round((s.fi / s.total) * 100) : 0
                      return (
                        <tr key={s.section} className="border-b last:border-0">
                          <td className="px-4 py-2 font-medium truncate max-w-[110px]" title={s.section}>
                            {s.section}
                          </td>
                          <td className="px-2 py-2 text-center text-green-700 dark:text-green-400">{s.fi}</td>
                          <td className="px-2 py-2 text-center text-amber-600 dark:text-amber-400">{s.partial}</td>
                          <td className="px-2 py-2 text-center text-red-600 dark:text-red-400">{s.ni}</td>
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-1.5">
                              <Progress value={pct} className="h-1.5 w-16 bg-muted" indicatorClassName="bg-green-500" />
                              <span className="text-muted-foreground">{pct}%</span>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {/* Assessor Actions */}
          {canAct && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Assessor Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Assessor Notes</Label>
                  <Textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    rows={3}
                    placeholder="Add notes for the record…"
                  />
                  <Button size="sm" onClick={handleSaveNotes} disabled={savingNotes}>
                    {savingNotes ? "Saving…" : "Save Notes"}
                  </Button>
                </div>

                <div className="border-t pt-4 space-y-2">
                  <Label className="text-xs font-medium">Final Decision</Label>
                  <Select value={decision} onValueChange={setDecision}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select decision…" />
                    </SelectTrigger>
                    <SelectContent>
                      {FINAL_DECISION_OPTIONS.map(o => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" onClick={handleSaveDecision} disabled={savingDecision}>
                    {savingDecision ? "Saving…" : "Save Decision"}
                  </Button>
                </div>

                <div className="border-t pt-4">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void triggerFlow(settingsStore.get("Flow_ExportURL", ""), id!)}
                  >
                    Export Report
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* ── Right panel ── */}
        <div className="flex-1 min-w-0 space-y-4">
          {responsesLoading ? (
            <div className="space-y-3">
              {Array(3).fill(null).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
            </div>
          ) : sections.length === 0 ? (
            <p className="text-muted-foreground text-sm">No responses recorded yet.</p>
          ) : (
            sections.map(section => (
              <div key={section}>
                <h2 className="text-base font-semibold mb-3 border-b pb-2">{section}</h2>
                {Object.entries(grouped[section])
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([subsection, subsResponses]) => (
                    <div key={subsection} className="mb-4">
                      {subsection !== "General" && subsection !== section && (
                        <h3 className="text-sm font-medium text-muted-foreground mb-2 ml-1">{subsection}</h3>
                      )}
                      <div className="space-y-2">
                        {subsResponses
                          .sort((a, b) => {
                            const qa = questionsMap.get(getQid(a))
                            const qb = questionsMap.get(getQid(b))
                            return (qa?.cr871_sortorder ?? 0) - (qb?.cr871_sortorder ?? 0)
                          })
                          .map(response => {
                            const q = questionsMap.get(getQid(response))
                            const maturityCode = response.cr871_maturitylevel as unknown as number
                            return (
                              <Card
                                key={response.cr871_responseid}
                                className={cn(response.cr871_iscovered && "opacity-60")}
                              >
                                <CardContent className="py-3">
                                  <div className="flex items-start gap-3">
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium leading-snug">
                                        {q?.cr871_questiontext ?? "—"}
                                      </p>
                                      {q?.cr871_evidencerequired && (
                                        <p className="text-xs text-muted-foreground mt-0.5 italic">
                                          Evidence: {q.cr871_evidencerequired}
                                        </p>
                                      )}
                                      {response.cr871_responsetext && (
                                        <p className="text-sm mt-2 text-muted-foreground whitespace-pre-wrap">
                                          {response.cr871_responsetext}
                                        </p>
                                      )}
                                      {response.cr871_compensatingcontrols && (
                                        <p className="text-xs mt-1 text-muted-foreground">
                                          <span className="font-medium">Compensating controls:</span>{" "}
                                          {response.cr871_compensatingcontrols}
                                        </p>
                                      )}
                                    </div>
                                    <div className="shrink-0 flex flex-col items-end gap-1">
                                      <span className={cn(
                                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                                        MATURITY_COLOR[maturityCode] ?? "bg-gray-100 text-gray-500"
                                      )}>
                                        {MATURITY_LABEL[maturityCode] ?? "—"}
                                      </span>
                                      {response.cr871_iscovered && (
                                        <span className="text-xs text-muted-foreground">Covered by cert</span>
                                      )}
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            )
                          })}
                      </div>
                    </div>
                  ))}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

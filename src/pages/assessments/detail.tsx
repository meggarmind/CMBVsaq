import { useState } from "react"
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
import { RiskBadge } from "@/components/risk-badge"
import { ScoreBar } from "@/components/score-bar"
import { Cr871_assessmentsService } from "@/generated/services/Cr871_assessmentsService"
import { Cr871_responsesService } from "@/generated/services/Cr871_responsesService"
import { Cr871_questionsService } from "@/generated/services/Cr871_questionsService"
import type { Cr871_responses } from "@/generated/models/Cr871_responsesModel"
import type { Cr871_questions } from "@/generated/models/Cr871_questionsModel"
import {
  ASSESSMENT_STATUS_LABEL, ASSESSMENT_STATUS_COLOR, FINAL_DECISION_LABEL,
  MATURITY_LABEL, MATURITY_COLOR, formatDate,
} from "@/lib/labels"
import { computeScore, getRiskBand, DEFAULT_THRESHOLDS } from "@/lib/scoring"
import { useAuthStore } from "@/stores/auth-store"
import { useSettingsStore } from "@/stores/settings-store"
import { cn } from "@/lib/utils"

const BAND_CODE: Record<string, number> = {
  LowRisk: 144610000, MediumRisk: 144610001, HighRisk: 144610002, CriticalRisk: 144610003,
}
const FINAL_DECISION_OPTIONS = Object.entries(FINAL_DECISION_LABEL).map(([code, label]) => ({ value: code, label }))

type QuestionMap = Map<string, Cr871_questions>

function groupBySection(responses: Cr871_responses[], questions: QuestionMap) {
  const sections: Record<string, Record<string, Cr871_responses[]>> = {}
  for (const r of responses) {
    const section = r.cr871_sectionid ?? "General"
    const qid = r._cr871_questionid_value ?? ""
    const q = questions.get(qid)
    const subsection = q?.cr871_subsectionid ?? "General"
    if (!sections[section]) sections[section] = {}
    if (!sections[section][subsection]) sections[section][subsection] = []
    sections[section][subsection].push(r)
  }
  return sections
}

export default function AssessmentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const role = useAuthStore(s => s.role)
  const settingsStore = useSettingsStore()
  const thresholds = {
    lowMin: settingsStore.getNumber("RiskBand_LowRisk_Min", DEFAULT_THRESHOLDS.lowMin),
    medMin: settingsStore.getNumber("RiskBand_MediumRisk_Min", DEFAULT_THRESHOLDS.medMin),
    highMin: settingsStore.getNumber("RiskBand_HighRisk_Min", DEFAULT_THRESHOLDS.highMin),
  }

  const [decision, setDecision] = useState("")
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)

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

  const liveScore = computeScore(responses)
  const liveBand = getRiskBand(liveScore, thresholds)
  const liveBandCode = BAND_CODE[liveBand]

  const grouped = groupBySection(responses, questionsMap)
  const sections = Object.keys(grouped).sort()

  const statusCode = assessment?.cr871_status as unknown as number
  const isComplete = statusCode === 144610004

  function initDecision() {
    const code = assessment?.cr871_finaldecision as unknown as number
    if (code && !decision) setDecision(String(code))
    if (assessment?.cr871_assessornotes && !notes) setNotes(assessment.cr871_assessornotes)
  }

  async function handleSaveDecision() {
    if (!id || !decision) { toast.error("Please select a decision."); return }
    setSaving(true)
    try {
      await Cr871_assessmentsService.update(id, {
        cr871_finaldecision: Number(decision) as never,
        cr871_assessornotes: notes || undefined,
        cr871_status: 144610004 as never, // Complete
        cr871_overallscore: liveScore,
        cr871_riskband: liveBandCode as never,
      })
      toast.success("Assessment completed.")
      await queryClient.invalidateQueries({ queryKey: ["cr871_assessments", id] })
    } catch {
      toast.error("Failed to save.")
    } finally {
      setSaving(false)
    }
  }

  if (assessmentLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
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
    <div className="space-y-6" onFocus={initDecision}>
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/assessments")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Assessments
        </Button>
      </div>

      {/* Header card */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-xl">{assessment.cr871_vendorname ?? "Assessment"}</CardTitle>
              {assessment.cr871_assessmentid1 && (
                <p className="text-xs text-muted-foreground mt-1 font-mono">{assessment.cr871_assessmentid1}</p>
              )}
            </div>
            <span className={cn(
              "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium shrink-0",
              ASSESSMENT_STATUS_COLOR[statusCode] ?? ""
            )}>
              {ASSESSMENT_STATUS_LABEL[statusCode] ?? "—"}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Due Date</p>
              <p className="font-medium">{formatDate(assessment.cr871_duedate)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Submitted</p>
              <p className="font-medium">{formatDate(assessment.cr871_submitdate)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Assessor</p>
              <p className="font-medium">{assessment.cr871_assessoremail ?? "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Vendor Contact</p>
              <p className="font-medium">{assessment.cr871_vendorcontactemail ?? "—"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Score summary */}
      {responses.length > 0 && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-8 flex-wrap">
              <div>
                <p className="text-sm text-muted-foreground">Live Score</p>
                <p className="text-3xl font-bold tabular-nums">{Math.round(liveScore)}%</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Risk Band</p>
                <RiskBadge code={liveBandCode} />
              </div>
              <div className="flex-1">
                <ScoreBar score={liveScore} thresholds={thresholds} showPercent={false} className="w-full max-w-xs" />
              </div>
              <div className="text-sm text-muted-foreground">
                {responses.filter((r: Cr871_responses) => !r.cr871_iscovered).length} applicable questions
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Responses by section */}
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
            {Object.entries(grouped[section]).sort(([a], [b]) => a.localeCompare(b)).map(([subsection, subsResponses]) => (
              <div key={subsection} className="mb-4">
                {subsection !== "General" && subsection !== section && (
                  <h3 className="text-sm font-medium text-muted-foreground mb-2 ml-1">{subsection}</h3>
                )}
                <div className="space-y-2">
                  {subsResponses
                    .sort((a, b) => {
                      const qa = questionsMap.get(a._cr871_questionid_value ?? "")
                      const qb = questionsMap.get(b._cr871_questionid_value ?? "")
                      return (qa?.cr871_sortorder ?? 0) - (qb?.cr871_sortorder ?? 0)
                    })
                    .map(response => {
                      const q = questionsMap.get(response._cr871_questionid_value ?? "")
                      const maturityCode = response.cr871_maturitylevel as unknown as number
                      return (
                        <Card key={response.cr871_responseid} className={cn(response.cr871_iscovered && "opacity-60")}>
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
                                    <span className="font-medium">Compensating controls:</span> {response.cr871_compensatingcontrols}
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

      {/* CISO decision panel */}
      {role === "CISO" && !isComplete && statusCode === 144610002 /* Submitted */ && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="text-base">Review Decision</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Final Decision <span className="text-destructive">*</span></Label>
              <Select value={decision} onValueChange={setDecision}>
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Select decision…" />
                </SelectTrigger>
                <SelectContent>
                  {FINAL_DECISION_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Assessor Notes</Label>
              <Textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                placeholder="Add notes for the record…"
              />
            </div>
            <Button onClick={handleSaveDecision} disabled={saving}>
              {saving ? "Saving…" : "Complete Assessment"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Show existing decision if complete */}
      {isComplete && (assessment.cr871_finaldecision !== undefined) && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Final Decision</p>
                <p className="font-semibold">{FINAL_DECISION_LABEL[assessment.cr871_finaldecision as unknown as number] ?? "—"}</p>
              </div>
              {assessment.cr871_assessornotes && (
                <div className="ml-8">
                  <p className="text-sm text-muted-foreground">Notes</p>
                  <p className="text-sm">{assessment.cr871_assessornotes}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

import { useEffect, useState, useCallback, useMemo } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import { Cr871_assessmentsService } from "@/generated/services/Cr871_assessmentsService"
import { Cr871_responsesService } from "@/generated/services/Cr871_responsesService"
import { Cr871_questionsService } from "@/generated/services/Cr871_questionsService"
import type { Cr871_responses } from "@/generated/models/Cr871_responsesModel"
import type { Cr871_questions } from "@/generated/models/Cr871_questionsModel"
import { MATURITY_LABEL, MATURITY_COLOR } from "@/lib/labels"
import { computeScore } from "@/lib/scoring"
import { useAuthStore } from "@/stores/auth-store"
import { cn } from "@/lib/utils"

const MATURITY_OPTIONS = Object.entries(MATURITY_LABEL).map(([code, label]) => ({ value: code, label }))

// Submitted / Under Review / Complete
const READ_ONLY_STATUSES = new Set([144610002, 144610003, 144610004])

function isApplicableQuestion(q: Cr871_questions, ratingName?: string): boolean {
  if (!ratingName) return true
  const ar = q.cr871_applicableratings
  if (!ar) return true
  return ar.toLowerCase().includes(ratingName.toLowerCase())
}

type ResponseMap = Map<string, Cr871_responses> // keyed by questionId

export default function VendorFormPage() {
  const assessmentId = useAuthStore(s => s.assessmentId)
  const queryClient = useQueryClient()
  const [submitting, setSubmitting] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [initDone, setInitDone] = useState(false)

  const { data: assessmentResult, isLoading: assessmentLoading } = useQuery({
    queryKey: ["cr871_assessments", assessmentId],
    queryFn: () => Cr871_assessmentsService.get(assessmentId!),
    enabled: !!assessmentId,
  })

  const { data: responsesResult, isLoading: responsesLoading } = useQuery({
    queryKey: ["cr871_responses", "assessment", assessmentId],
    queryFn: () => Cr871_responsesService.getAll({
      filter: `_cr871_assessmentid_value eq '${assessmentId}'`,
    }),
    enabled: !!assessmentId,
  })

  const { data: questionsResult, isLoading: questionsLoading } = useQuery({
    queryKey: ["cr871_questions", "active"],
    queryFn: () => Cr871_questionsService.getAll({
      filter: "statecode eq 0",
      orderBy: ["cr871_sectionid asc", "cr871_sortorder asc"],
    }),
  })

  const assessment = assessmentResult?.data
  const allResponses = useMemo(() => responsesResult?.data ?? [], [responsesResult?.data])
  const allQuestions = useMemo(() => questionsResult?.data ?? [], [questionsResult?.data])

  const ratingName = assessment?.cr871_riskratingname
  const statusCode = assessment?.cr871_status as unknown as number
  const isReadOnly = READ_ONLY_STATUSES.has(statusCode)

  // Build response map keyed by questionId
  const responseMap: ResponseMap = useMemo(
    () => new Map(allResponses.map((r: Cr871_responses) => [r._cr871_questionid_value ?? "", r])),
    [allResponses]
  )

  // Filter applicable questions
  const applicableQuestions = allQuestions.filter((q: Cr871_questions) =>
    isApplicableQuestion(q, ratingName)
  )

  // Create missing response stubs on first load
  const createStubs = useCallback(async () => {
    if (!assessmentId || initDone || isReadOnly) return
    if (!assessment || applicableQuestions.length === 0) return

    const missing = applicableQuestions.filter((q: Cr871_questions) => !responseMap.has(q.cr871_questionid))
    if (missing.length === 0) { setInitDone(true); return }

    try {
      await Promise.all(missing.map((q: Cr871_questions) =>
        Cr871_responsesService.create({
          "cr871_AssessmentID@odata.bind": `/cr871_assessments(${assessmentId})`,
          "cr871_QuestionID@odata.bind": `/cr871_questions(${q.cr871_questionid})`,
          cr871_maturitylevel: 144610004 as never, // NotAnswered
          cr871_iscovered: q.cr871_iscoveredbycert ?? false,
          cr871_isgatequestion: q.cr871_isgatequestion ?? false,
          cr871_sectionid: q.cr871_sectionid,
          ownerid: "",
          owneridtype: "systemusers",
          statecode: 0,
        })
      ))
      await queryClient.invalidateQueries({ queryKey: ["cr871_responses", "assessment", assessmentId] })
    } catch {
      toast.error("Could not initialise questionnaire. Please refresh.")
    } finally {
      setInitDone(true)
    }
  }, [assessmentId, assessment, applicableQuestions, responseMap, initDone, isReadOnly, queryClient])

  useEffect(() => {
    if (!assessmentLoading && !responsesLoading && !questionsLoading && !initDone) {
      void createStubs()
    }
  }, [assessmentLoading, responsesLoading, questionsLoading, initDone, createStubs])

  async function handleFieldUpdate(responseId: string, field: string, value: string) {
    try {
      await Cr871_responsesService.update(responseId, { [field]: field === "cr871_maturitylevel" ? Number(value) as never : value })
      await queryClient.invalidateQueries({ queryKey: ["cr871_responses", "assessment", assessmentId] })
    } catch {
      toast.error("Failed to save. Please try again.")
    }
  }

  async function handleSubmit() {
    if (!assessmentId) return
    setSubmitting(true)
    try {
      const today = new Date().toISOString().split("T")[0]
      const liveScore = computeScore(allResponses)
      await Cr871_assessmentsService.update(assessmentId, {
        cr871_status: 144610002 as never, // Submitted
        cr871_submitdate: today,
        cr871_overallscore: liveScore,
      })
      setSubmitted(true)
      setShowConfirm(false)
    } catch {
      toast.error("Submission failed. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  // Group applicable questions by section → subsection
  const sections: Record<string, Record<string, Cr871_questions[]>> = {}
  for (const q of applicableQuestions) {
    const section = q.cr871_sectionid ?? "General"
    const sub = q.cr871_subsectionid ?? "General"
    if (!sections[section]) sections[section] = {}
    if (!sections[section][sub]) sections[section][sub] = []
    sections[section][sub].push(q)
  }
  const sectionNames = Object.keys(sections).sort()

  const loading = assessmentLoading || responsesLoading || questionsLoading || !initDone

  if (!assessmentId) {
    return (
      <div className="min-h-dvh grid place-items-center">
        <div className="text-center space-y-2">
          <p className="text-lg font-medium">No assessment found</p>
          <p className="text-sm text-muted-foreground">Please use the link provided in your invitation email.</p>
        </div>
      </div>
    )
  }

  if (assessmentLoading) {
    return (
      <div className="min-h-dvh grid place-items-center">
        <div className="text-sm text-muted-foreground">Loading questionnaire…</div>
      </div>
    )
  }

  if (!assessment) {
    return (
      <div className="min-h-dvh grid place-items-center">
        <p className="text-muted-foreground">Assessment not found or access denied.</p>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="min-h-dvh grid place-items-center">
        <div className="text-center space-y-4">
          <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
          <h1 className="text-2xl font-semibold">Submitted Successfully</h1>
          <p className="text-muted-foreground max-w-sm">
            Thank you. Your responses have been submitted for review. You will be contacted if further information is required.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh flex flex-col bg-background">
      {/* Header */}
      <header className="border-b px-6 py-4 shrink-0">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-lg font-semibold">Vendor Security Assessment</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {assessment.cr871_vendorname}
            {assessment.cr871_duedate && (
              <> · Due {new Date(assessment.cr871_duedate).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}</>
            )}
          </p>
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-6 space-y-6">
        {isReadOnly && (
          <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
            This assessment has been submitted and is now read-only.
          </div>
        )}

        {loading ? (
          <div className="space-y-4">
            {Array(4).fill(null).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}
          </div>
        ) : sectionNames.length === 0 ? (
          <p className="text-muted-foreground">No questions available for this assessment.</p>
        ) : (
          <Tabs defaultValue={sectionNames[0]}>
            <TabsList className="mb-4 flex-wrap h-auto gap-1">
              {sectionNames.map(s => (
                <TabsTrigger key={s} value={s} className="text-xs">{s}</TabsTrigger>
              ))}
            </TabsList>

            {sectionNames.map(section => (
              <TabsContent key={section} value={section} className="space-y-6">
                {Object.entries(sections[section])
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([subsection, questions]) => (
                    <div key={subsection}>
                      {subsection !== "General" && subsection !== section && (
                        <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                          {subsection}
                        </h3>
                      )}
                      <div className="space-y-4">
                        {questions.map(q => {
                          const response = responseMap.get(q.cr871_questionid)
                          if (!response) return null
                          const maturityCode = response.cr871_maturitylevel as unknown as number
                          return (
                            <Card key={q.cr871_questionid}>
                              <CardContent className="py-4 space-y-3">
                                <div className="flex items-start justify-between gap-4">
                                  <p className="text-sm font-medium leading-snug flex-1">
                                    {q.cr871_isgatequestion && (
                                      <span className="inline-block mr-2 text-xs rounded bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200 px-1.5 py-0.5 font-normal">
                                        Gate
                                      </span>
                                    )}
                                    {q.cr871_questiontext}
                                  </p>
                                  {response.cr871_iscovered && (
                                    <span className="shrink-0 text-xs rounded bg-gray-100 dark:bg-gray-800 text-gray-500 px-2 py-0.5">
                                      Covered by cert
                                    </span>
                                  )}
                                </div>

                                {q.cr871_evidencerequired && (
                                  <p className="text-xs text-muted-foreground italic">
                                    Evidence required: {q.cr871_evidencerequired}
                                  </p>
                                )}

                                <div className="space-y-1.5">
                                  <p className="text-xs font-medium text-muted-foreground">Maturity Level</p>
                                  {isReadOnly ? (
                                    <span className={cn(
                                      "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                                      MATURITY_COLOR[maturityCode] ?? ""
                                    )}>
                                      {MATURITY_LABEL[maturityCode] ?? "—"}
                                    </span>
                                  ) : (
                                    <Select
                                      defaultValue={maturityCode ? String(maturityCode) : ""}
                                      onValueChange={val => handleFieldUpdate(response.cr871_responseid, "cr871_maturitylevel", val)}
                                    >
                                      <SelectTrigger className="w-64 h-8 text-sm">
                                        <SelectValue placeholder="Select maturity…" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {MATURITY_OPTIONS.filter(o => o.value !== "144610004").map(o => (
                                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  )}
                                </div>

                                <div className="space-y-1.5">
                                  <p className="text-xs font-medium text-muted-foreground">Response / Comments</p>
                                  {isReadOnly ? (
                                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                                      {response.cr871_responsetext || "—"}
                                    </p>
                                  ) : (
                                    <Textarea
                                      defaultValue={response.cr871_responsetext ?? ""}
                                      rows={2}
                                      placeholder="Describe your implementation…"
                                      onBlur={e => handleFieldUpdate(response.cr871_responseid, "cr871_responsetext", e.target.value)}
                                    />
                                  )}
                                </div>

                                <div className="space-y-1.5">
                                  <p className="text-xs font-medium text-muted-foreground">Compensating Controls (if any)</p>
                                  {isReadOnly ? (
                                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                                      {response.cr871_compensatingcontrols || "—"}
                                    </p>
                                  ) : (
                                    <Textarea
                                      defaultValue={response.cr871_compensatingcontrols ?? ""}
                                      rows={2}
                                      placeholder="Describe any compensating controls…"
                                      onBlur={e => handleFieldUpdate(response.cr871_responseid, "cr871_compensatingcontrols", e.target.value)}
                                    />
                                  )}
                                </div>
                              </CardContent>
                            </Card>
                          )
                        })}
                      </div>
                    </div>
                  ))}
              </TabsContent>
            ))}
          </Tabs>
        )}

        {!isReadOnly && !loading && (
          <div className="flex justify-end pt-4 border-t">
            <Button size="lg" onClick={() => setShowConfirm(true)}>
              Submit Assessment
            </Button>
          </div>
        )}
      </main>

      {/* Submit confirmation dialog */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit Assessment?</DialogTitle>
            <DialogDescription>
              Once submitted, your responses will be locked and sent for review. You will not be able to make further changes.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirm(false)}>Go Back</Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Submitting…" : "Yes, Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

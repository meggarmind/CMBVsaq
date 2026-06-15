import { useEffect, useState, useCallback, useMemo, useRef } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
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
import { Cr871_vendorsService } from "@/generated/services/Cr871_vendorsService"
import type { Cr871_responses } from "@/generated/models/Cr871_responsesModel"
import type { Cr871_questions } from "@/generated/models/Cr871_questionsModel"
import { MATURITY_LABEL, MATURITY_COLOR } from "@/lib/labels"
import { computeScore } from "@/lib/scoring"
import { useAuthStore } from "@/stores/auth-store"
import { cn } from "@/lib/utils"

const MATURITY_OPTIONS = Object.entries(MATURITY_LABEL).map(([code, label]) => ({ value: code, label }))
const READ_ONLY_STATUSES = new Set([144610002, 144610003, 144610004])
const INVITED = 144610000
const IN_PROGRESS = 144610001
const NOT_ANSWERED = 144610004
const FI = 144610000
const NOT_APPLICABLE = 144610003

type VendorScreen = "home" | "profile" | "section" | "submit" | "done"
type SectionStatus = "Not Started" | "In Progress" | "Complete"
type ResponseMap = Map<string, Cr871_responses>
type LocalEdit = { maturity: number; text: string; controls: string }

function isApplicableQuestion(q: Cr871_questions, ratingName?: string): boolean {
  if (!ratingName) return true
  const ar = q.cr871_applicableratings
  if (!ar) return true
  return ar.toLowerCase().includes(ratingName.toLowerCase())
}

function getOrderedSections(questions: Cr871_questions[]): string[] {
  return [...new Set(questions.map(q => q.cr871_sectionid ?? "General"))].sort()
}

function getSectionStatus(
  sectionId: string,
  questions: Cr871_questions[],
  responseMap: ResponseMap,
): SectionStatus {
  const qs = questions.filter(q => (q.cr871_sectionid ?? "General") === sectionId)
  if (qs.length === 0) return "Not Started"
  const answered = qs.filter(q => {
    const r = responseMap.get(q.cr871_questionid)
    return r && (r.cr871_maturitylevel as unknown as number) !== NOT_ANSWERED
  })
  if (answered.length === 0) return "Not Started"
  if (answered.length === qs.length) return "Complete"
  return "In Progress"
}

const SECTION_STATUS_CLASS: Record<SectionStatus, string> = {
  "Not Started": "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  "In Progress": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  "Complete": "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
}

function ProfileField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium mt-0.5">{value ?? "—"}</p>
    </div>
  )
}

export default function VendorFormPage() {
  const assessmentId = useAuthStore(s => s.assessmentId)
  const queryClient = useQueryClient()

  const [screen, setScreen] = useState<VendorScreen>("home")
  const [currentSection, setCurrentSection] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [stubsDone, setStubsDone] = useState(false)
  const [localEdits, setLocalEdits] = useState<Map<string, LocalEdit>>(new Map())
  const [saving, setSaving] = useState(false)

  const initDone = useRef(false)
  const statusTransitioned = useRef(false)
  const localEditsSection = useRef<string | null>(null)

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
  const vendorId = assessment?._cr871_vendorid_value

  const { data: vendorResult } = useQuery({
    queryKey: ["cr871_vendors", vendorId],
    queryFn: () => Cr871_vendorsService.get(vendorId!),
    enabled: !!vendorId,
  })
  const vendor = vendorResult?.data

  const allResponses = useMemo(() => responsesResult?.data ?? [], [responsesResult?.data])
  const allQuestions = useMemo(() => questionsResult?.data ?? [], [questionsResult?.data])

  const ratingName = assessment?.cr871_riskratingname
  const statusCode = assessment?.cr871_status as unknown as number
  const isReadOnly = READ_ONLY_STATUSES.has(statusCode)

  const responseMap: ResponseMap = useMemo(
    () => new Map(allResponses.map(r => [r._cr871_questionid_value ?? "", r])),
    [allResponses]
  )

  const applicableQuestions = useMemo(
    () => allQuestions.filter(q => isApplicableQuestion(q, ratingName)),
    [allQuestions, ratingName]
  )

  const orderedSections = useMemo(() => getOrderedSections(applicableQuestions), [applicableQuestions])

  const answeredCount = useMemo(
    () => applicableQuestions.filter(q => {
      const r = responseMap.get(q.cr871_questionid)
      return r && (r.cr871_maturitylevel as unknown as number) !== NOT_ANSWERED
    }).length,
    [applicableQuestions, responseMap]
  )
  const totalCount = applicableQuestions.length

  useEffect(() => {
    if (statusCode !== INVITED) {
      statusTransitioned.current = true
    }
  }, [statusCode])

  const createStubs = useCallback(async () => {
    if (!assessmentId || initDone.current) return
    if (!assessment || applicableQuestions.length === 0) return

    const missing = applicableQuestions.filter(q => !responseMap.has(q.cr871_questionid))
    if (missing.length === 0) { initDone.current = true; setStubsDone(true); return }

    try {
      await Promise.all(missing.map(q =>
        Cr871_responsesService.create({
          "cr871_AssessmentID@odata.bind": `/cr871_assessments(${assessmentId})`,
          "cr871_QuestionID@odata.bind": `/cr871_questions(${q.cr871_questionid})`,
          cr871_maturitylevel: 144610004 as never,
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
      initDone.current = true
      setStubsDone(true)
    }
  }, [assessmentId, assessment, applicableQuestions, responseMap, queryClient])

  useEffect(() => {
    if (assessmentLoading || responsesLoading || questionsLoading || stubsDone) return
    if (isReadOnly) { setStubsDone(true); return }
    void createStubs()
  }, [assessmentLoading, responsesLoading, questionsLoading, stubsDone, isReadOnly, createStubs])

  function goToSection(section: string) { localEditsSection.current = null; setCurrentSection(section); setScreen("section") }
  function goHome() { localEditsSection.current = null; setScreen("home") }
  function goProfile() { setScreen("profile") }
  function goSubmit() { setScreen("submit") }

  useEffect(() => {
    if (!currentSection || screen !== "section") return
    if (localEditsSection.current !== null) return
    if (!responsesResult || applicableQuestions.length === 0) return
    localEditsSection.current = currentSection
    const sectionQs = applicableQuestions.filter(q => (q.cr871_sectionid ?? "General") === currentSection)
    const edits = new Map<string, LocalEdit>()
    for (const q of sectionQs) {
      const r = responseMap.get(q.cr871_questionid)
      edits.set(q.cr871_questionid, {
        maturity: (r?.cr871_maturitylevel as unknown as number) ?? NOT_ANSWERED,
        text: r?.cr871_responsetext ?? "",
        controls: r?.cr871_compensatingcontrols ?? "",
      })
    }
    setLocalEdits(edits)
  }, [currentSection, screen, applicableQuestions, responseMap, responsesResult])

  async function handleSectionSave(andThen: "home" | "next" | null) {
    if (!assessmentId || saving) return
    if (statusCode === INVITED && !statusTransitioned.current) {
      statusTransitioned.current = true
      try {
        await Cr871_assessmentsService.update(assessmentId, { cr871_status: IN_PROGRESS as never })
        await queryClient.invalidateQueries({ queryKey: ["cr871_assessments", assessmentId] })
      } catch { statusTransitioned.current = false }
    }
    setSaving(true)
    try {
      const sectionQs = applicableQuestions.filter(q => (q.cr871_sectionid ?? "General") === currentSection)
      await Promise.all(sectionQs.map(async q => {
        const edit = localEdits.get(q.cr871_questionid)
        if (!edit) return
        let maturity = edit.maturity
        let iscovered = false
        if (q.cr871_gatequestionid) {
          const gateMaturity = localEdits.get(q.cr871_gatequestionid)?.maturity
          if (q.cr871_iscoveredbycert) {
            if (gateMaturity === FI) { maturity = NOT_APPLICABLE; iscovered = true }
          } else {
            if (gateMaturity !== FI) { maturity = NOT_APPLICABLE; iscovered = true }
          }
        }
        const response = responseMap.get(q.cr871_questionid)
        if (response) {
          await Cr871_responsesService.update(response.cr871_responseid, {
            cr871_maturitylevel: maturity as never,
            cr871_responsetext: edit.text,
            cr871_compensatingcontrols: edit.controls,
            cr871_iscovered: iscovered,
          })
        } else {
          await Cr871_responsesService.create({
            "cr871_AssessmentID@odata.bind": `/cr871_assessments(${assessmentId})`,
            "cr871_QuestionID@odata.bind": `/cr871_questions(${q.cr871_questionid})`,
            cr871_maturitylevel: maturity as never,
            cr871_responsetext: edit.text,
            cr871_compensatingcontrols: edit.controls,
            cr871_iscovered: iscovered,
            cr871_isgatequestion: q.cr871_isgatequestion ?? false,
            cr871_sectionid: q.cr871_sectionid,
            ownerid: "",
            owneridtype: "systemusers",
            statecode: 0,
          })
        }
      }))
      await queryClient.invalidateQueries({ queryKey: ["cr871_responses", "assessment", assessmentId] })
      toast.success("Saved.")
      if (andThen === "home") goHome()
      else if (andThen === "next") {
        if (nextSection) goToSection(nextSection)
        else goSubmit()
      }
    } catch {
      toast.error("Failed to save. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  async function handleSubmit() {
    if (!assessmentId) return
    setSubmitting(true)
    try {
      const today = new Date().toISOString().split("T")[0]
      const liveScore = computeScore(allResponses)
      await Cr871_assessmentsService.update(assessmentId, {
        cr871_status: 144610002 as never,
        cr871_submitdate: today,
        cr871_overallscore: liveScore,
      })
      setScreen("done")
      setShowConfirm(false)
    } catch {
      toast.error("Submission failed. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  const dueDate = assessment?.cr871_duedate ? new Date(assessment.cr871_duedate) : null
  const daysUntilDue = dueDate
    ? Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null
  const dueDateRed = daysUntilDue !== null && daysUntilDue <= 7
  const dueDateLabel = dueDate
    ? dueDate.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })
    : null

  const sectionIndex = currentSection ? orderedSections.indexOf(currentSection) : -1
  const nextSection =
    sectionIndex >= 0 && sectionIndex < orderedSections.length - 1
      ? orderedSections[sectionIndex + 1]
      : null
  const firstIncompleteSection =
    orderedSections.find(s => getSectionStatus(s, applicableQuestions, responseMap) !== "Complete") ??
    orderedSections[0]

  const loading = assessmentLoading || responsesLoading || questionsLoading || (!stubsDone && !isReadOnly)

  const VendorHeader = (
    <header className="border-b px-6 py-4 shrink-0 bg-[--sidebar]">
      <div className="max-w-2xl mx-auto flex items-center gap-3">
        <span className="text-xl font-bold text-[--sidebar-primary]">CMB</span>
        <span className="text-white/90 text-sm font-medium">Vendor Security Assessment</span>
      </div>
    </header>
  )

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

  if (screen === "done") {
    return (
      <div className="min-h-dvh flex flex-col bg-background">
        {VendorHeader}
        <div className="flex-1 grid place-items-center">
          <div className="text-center space-y-4">
            <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
            <h1 className="text-2xl font-semibold">Submitted Successfully</h1>
            <p className="text-muted-foreground max-w-sm">
              Thank you. Your responses have been submitted for review. You will be contacted if further information is required.
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (screen === "home") {
    return (
      <div className="min-h-dvh flex flex-col bg-background">
        {VendorHeader}
        <main className="flex-1 max-w-2xl mx-auto w-full px-6 py-6 space-y-6">
          <div>
            <h1 className="text-2xl font-semibold">Welcome, {assessment.cr871_vendorname}</h1>
            {dueDateLabel && (
              <p className={cn("text-sm mt-1", dueDateRed ? "text-red-600 font-medium" : "text-muted-foreground")}>
                Due: {dueDateLabel}
                {dueDateRed && daysUntilDue !== null && (
                  <span className="ml-1">
                    ({daysUntilDue <= 0 ? "overdue" : `${daysUntilDue} day${daysUntilDue === 1 ? "" : "s"} remaining`})
                  </span>
                )}
              </p>
            )}
          </div>

          {isReadOnly && (
            <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
              This assessment has been submitted and is now read-only.
            </div>
          )}

          <Card>
            <CardContent className="py-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="font-medium">Overall Progress</span>
                <span className="text-muted-foreground">{answeredCount} of {totalCount} questions answered</span>
              </div>
              {loading
                ? <Skeleton className="h-2 w-full" />
                : <Progress value={totalCount > 0 ? (answeredCount / totalCount) * 100 : 0} className="h-2" />
              }
            </CardContent>
          </Card>

          <Card>
            <CardContent className="py-4">
              <p className="text-sm font-medium mb-3">Sections</p>
              {loading ? (
                <div className="space-y-2">
                  {Array(4).fill(null).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-md" />)}
                </div>
              ) : orderedSections.length === 0 ? (
                <p className="text-sm text-muted-foreground">No sections available.</p>
              ) : (
                <div className="space-y-1">
                  {orderedSections.map(section => {
                    const status = getSectionStatus(section, applicableQuestions, responseMap)
                    const qs = applicableQuestions.filter(q => (q.cr871_sectionid ?? "General") === section)
                    const answeredInSection = qs.filter(q => {
                      const r = responseMap.get(q.cr871_questionid)
                      return r && (r.cr871_maturitylevel as unknown as number) !== NOT_ANSWERED
                    }).length
                    return (
                      <button
                        key={section}
                        type="button"
                        className="w-full flex items-center justify-between px-3 py-2.5 rounded-md hover:bg-muted/50 transition-colors text-left"
                        onClick={() => goToSection(section)}
                      >
                        <span className="text-sm font-medium">{section}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground">{answeredInSection}/{qs.length}</span>
                          <span className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                            SECTION_STATUS_CLASS[status]
                          )}>
                            {status}
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex gap-3 flex-wrap">
            {!isReadOnly && (
              <>
                <Button variant="outline" onClick={goProfile}>Edit Profile</Button>
                <Button
                  onClick={() => firstIncompleteSection && goToSection(firstIncompleteSection)}
                  disabled={loading || orderedSections.length === 0}
                >
                  Continue Assessment
                </Button>
              </>
            )}
            <Button variant="outline" onClick={goSubmit}>
              {isReadOnly ? "View Summary" : "Review & Submit"}
            </Button>
          </div>
        </main>
      </div>
    )
  }

  if (screen === "profile") {
    return (
      <div className="min-h-dvh flex flex-col bg-background">
        {VendorHeader}
        <main className="flex-1 max-w-2xl mx-auto w-full px-6 py-6 space-y-6">
          <h1 className="text-xl font-semibold">Vendor Profile</h1>
          <Card>
            <CardContent className="py-6 space-y-5">
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <ProfileField label="Company Name" value={vendor?.cr871_vendorname} />
                <ProfileField label="Legal Entity Name" value={vendor?.cr871_legalentityname} />
                <ProfileField label="RC Number" value={vendor?.cr871_rcnumber} />
                <ProfileField label="Contact Email" value={assessment.cr871_vendorcontactemail} />
              </div>
              <ProfileField label="Primary Contact Name" value={assessment.cr871_vendorname} />
            </CardContent>
          </Card>
          <div className="flex justify-between">
            <Button variant="outline" onClick={goHome}>Back</Button>
            <Button
              onClick={() => orderedSections[0] && goToSection(orderedSections[0])}
              disabled={orderedSections.length === 0}
            >
              Next{orderedSections[0] ? `: ${orderedSections[0]}` : ""}
            </Button>
          </div>
        </main>
      </div>
    )
  }

  if (screen === "section" && currentSection) {
    const sectionQuestions = applicableQuestions.filter(
      q => (q.cr871_sectionid ?? "General") === currentSection
    )
    const subsections: Record<string, Cr871_questions[]> = {}
    for (const q of sectionQuestions) {
      const sub = q.cr871_subsectionid ?? "General"
      if (!subsections[sub]) subsections[sub] = []
      subsections[sub].push(q)
    }

    return (
      <div className="min-h-dvh flex flex-col bg-background">
        {VendorHeader}
        <main className="flex-1 max-w-2xl mx-auto w-full px-6 py-6 space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-sm">
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground transition-colors"
                onClick={goHome}
              >
                Overview
              </button>
              <span className="text-muted-foreground">/</span>
              <h1 className="text-xl font-semibold">{currentSection}</h1>
            </div>
            <span className="text-xs text-muted-foreground shrink-0">
              Section {sectionIndex + 1} of {orderedSections.length}
            </span>
          </div>

          {isReadOnly && (
            <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
              This assessment has been submitted and is now read-only.
            </div>
          )}

          {loading ? (
            <div className="space-y-4">
              {Array(4).fill(null).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(subsections)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([subsection, questions]) => (
                  <div key={subsection}>
                    {subsection !== "General" && subsection !== currentSection && (
                      <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                        {subsection}
                      </h3>
                    )}
                    <div className="space-y-4">
                      {questions.map(q => {
                        const isVisible =
                          !q.cr871_gatequestionid ||
                          q.cr871_iscoveredbycert ||
                          localEdits.get(q.cr871_gatequestionid)?.maturity === FI
                        if (!isVisible) return null
                        const response = responseMap.get(q.cr871_questionid)
                        const maturityCode = (response?.cr871_maturitylevel as unknown as number) ?? NOT_ANSWERED
                        const edit = localEdits.get(q.cr871_questionid)
                        const isCoveredByGate =
                          !!q.cr871_iscoveredbycert &&
                          !!q.cr871_gatequestionid &&
                          localEdits.get(q.cr871_gatequestionid)?.maturity === FI
                        return (
                          <div key={q.cr871_questionid} className="relative">
                            <Card>
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
                                  {response?.cr871_iscovered && !isCoveredByGate && (
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
                                      value={edit ? String(edit.maturity) : ""}
                                      onValueChange={val => setLocalEdits(prev => {
                                        const next = new Map(prev)
                                        const cur = next.get(q.cr871_questionid)
                                        if (cur) next.set(q.cr871_questionid, { ...cur, maturity: Number(val) })
                                        return next
                                      })}
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
                                      {response?.cr871_responsetext || "—"}
                                    </p>
                                  ) : (
                                    <Textarea
                                      value={edit?.text ?? ""}
                                      rows={2}
                                      placeholder="Describe your implementation…"
                                      onChange={e => setLocalEdits(prev => {
                                        const next = new Map(prev)
                                        const cur = next.get(q.cr871_questionid)
                                        if (cur) next.set(q.cr871_questionid, { ...cur, text: e.target.value })
                                        return next
                                      })}
                                    />
                                  )}
                                </div>
                                <div className="space-y-1.5">
                                  <p className="text-xs font-medium text-muted-foreground">Compensating Controls (if any)</p>
                                  {isReadOnly ? (
                                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                                      {response?.cr871_compensatingcontrols || "—"}
                                    </p>
                                  ) : (
                                    <Textarea
                                      value={edit?.controls ?? ""}
                                      rows={2}
                                      placeholder="Describe any compensating controls…"
                                      onChange={e => setLocalEdits(prev => {
                                        const next = new Map(prev)
                                        const cur = next.get(q.cr871_questionid)
                                        if (cur) next.set(q.cr871_questionid, { ...cur, controls: e.target.value })
                                        return next
                                      })}
                                    />
                                  )}
                                </div>
                              </CardContent>
                            </Card>
                            {isCoveredByGate && (
                              <div className="absolute inset-0 bg-gray-50/90 dark:bg-gray-900/90 rounded-lg flex items-center justify-center pointer-events-none">
                                <span className="text-sm font-medium text-gray-500">Covered by certification</span>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
            </div>
          )}

          {isReadOnly ? (
            <div className="flex justify-between pt-4 border-t">
              <Button variant="outline" onClick={goHome}>Back to Overview</Button>
              {nextSection
                ? <Button variant="outline" onClick={() => goToSection(nextSection)}>Next: {nextSection}</Button>
                : <Button variant="outline" onClick={goSubmit}>View Summary</Button>
              }
            </div>
          ) : (
            <div className="flex justify-between pt-4 border-t">
              <Button variant="outline" onClick={() => void handleSectionSave("home")} disabled={saving}>
                {saving ? "Saving…" : "Save & Return Home"}
              </Button>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={goHome} disabled={saving}>Discard</Button>
                <Button onClick={() => void handleSectionSave("next")} disabled={saving}>
                  {saving ? "Saving…" : nextSection ? `Save & Next: ${nextSection}` : "Save & Review"}
                </Button>
              </div>
            </div>
          )}
        </main>
      </div>
    )
  }

  // Screen_Submit (default for "submit" or fallback)
  return (
    <div className="min-h-dvh flex flex-col bg-background">
      {VendorHeader}
      <main className="flex-1 max-w-2xl mx-auto w-full px-6 py-6 space-y-6">
        <h1 className="text-xl font-semibold">Review &amp; Submit</h1>

        {isReadOnly && (
          <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
            This assessment has been submitted and is now read-only.
          </div>
        )}

        <Card>
          <CardContent className="py-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left pb-2 font-medium text-muted-foreground">Section</th>
                    <th className="text-left pb-2 font-medium text-muted-foreground">Status</th>
                    <th className="text-right pb-2 font-medium text-muted-foreground">Answered</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array(3).fill(null).map((_, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-2.5"><Skeleton className="h-4 w-24" /></td>
                        <td className="py-2.5"><Skeleton className="h-5 w-20 rounded-full" /></td>
                        <td className="py-2.5 text-right"><Skeleton className="h-4 w-12 ml-auto" /></td>
                      </tr>
                    ))
                  ) : (
                    orderedSections.map(section => {
                      const status = getSectionStatus(section, applicableQuestions, responseMap)
                      const qs = applicableQuestions.filter(q => (q.cr871_sectionid ?? "General") === section)
                      const answeredInSection = qs.filter(q => {
                        const r = responseMap.get(q.cr871_questionid)
                        return r && (r.cr871_maturitylevel as unknown as number) !== NOT_ANSWERED
                      }).length
                      return (
                        <tr key={section} className="border-b last:border-0">
                          <td className="py-2.5">
                            <button
                              type="button"
                              className="text-left hover:underline"
                              onClick={() => goToSection(section)}
                            >
                              {section}
                            </button>
                          </td>
                          <td className="py-2.5">
                            <span className={cn(
                              "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                              SECTION_STATUS_CLASS[status]
                            )}>
                              {status}
                            </span>
                          </td>
                          <td className="py-2.5 text-right text-muted-foreground">
                            {answeredInSection}/{qs.length}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="font-medium">Overall Progress</span>
            <span className="text-muted-foreground">{answeredCount} of {totalCount} questions answered</span>
          </div>
          <Progress value={totalCount > 0 ? (answeredCount / totalCount) * 100 : 0} className="h-2" />
        </div>

        {!isReadOnly && answeredCount < totalCount && (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            {totalCount - answeredCount} question{totalCount - answeredCount === 1 ? "" : "s"} still unanswered — please complete all sections before submitting.
          </p>
        )}
        <div className="flex justify-between pt-2">
          <Button variant="outline" onClick={goHome}>Back to Overview</Button>
          {!isReadOnly && (
            <Button onClick={() => setShowConfirm(true)} disabled={answeredCount < totalCount}>
              Submit Assessment
            </Button>
          )}
        </div>
      </main>

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

import { useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { ArrowLeft, PlusIcon, PencilIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { RiskBadge } from "@/components/risk-badge"
import { ScoreBar } from "@/components/score-bar"
import { Cr871_vendorsService } from "@/generated/services/Cr871_vendorsService"
import { Cr871_assessmentsService } from "@/generated/services/Cr871_assessmentsService"
import {
  ASSESSMENT_STATUS_LABEL, ASSESSMENT_STATUS_COLOR, FINAL_DECISION_LABEL,
  formatDate,
} from "@/lib/labels"
import { useSettingsStore } from "@/stores/settings-store"
import { DEFAULT_THRESHOLDS } from "@/lib/scoring"
import { cn } from "@/lib/utils"

const RISK_RATING_OPTIONS = [
  { value: "144610000", label: "Critical" },
  { value: "144610001", label: "High" },
  { value: "144610002", label: "Medium" },
  { value: "144610003", label: "Low" },
]

export default function VendorDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [showEdit, setShowEdit] = useState(false)
  const [showNewAssessment, setShowNewAssessment] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editForm, setEditForm] = useState({
    name: "", legal: "", rc: "", contactEmail: "", assessorEmail: "", notes: "",
  })
  const [assessForm, setAssessForm] = useState({
    riskRating: "", dueDate: "", assessorEmail: "", vendorContactEmail: "", notes: "",
  })

  const settingsStore = useSettingsStore()
  const thresholds = {
    lowMin: settingsStore.getNumber("RiskBand_LowRisk_Min", DEFAULT_THRESHOLDS.lowMin),
    medMin: settingsStore.getNumber("RiskBand_MediumRisk_Min", DEFAULT_THRESHOLDS.medMin),
    highMin: settingsStore.getNumber("RiskBand_HighRisk_Min", DEFAULT_THRESHOLDS.highMin),
  }

  const { data: vendorResult, isLoading: vendorLoading } = useQuery({
    queryKey: ["cr871_vendors", id],
    queryFn: () => Cr871_vendorsService.get(id!),
    enabled: !!id,
  })

  const { data: assessmentsResult, isLoading: assessmentsLoading } = useQuery({
    queryKey: ["cr871_assessments", "vendor", id],
    queryFn: () => Cr871_assessmentsService.getAll({
      filter: `_cr871_vendorid_value eq '${id}'`,
      orderBy: ["createdon desc"],
    }),
    enabled: !!id,
  })

  const vendor = vendorResult?.data
  const assessments = assessmentsResult?.data ?? []

  function openEdit() {
    if (!vendor) return
    setEditForm({
      name: vendor.cr871_vendorname ?? "",
      legal: vendor.cr871_legalentityname ?? "",
      rc: vendor.cr871_rcnumber ?? "",
      contactEmail: vendor.cr871_vendorcontactemail ?? "",
      assessorEmail: vendor.cr871_primaryassessoremail ?? "",
      notes: vendor.cr871_vendornotes ?? "",
    })
    setShowEdit(true)
  }

  async function handleSaveVendor() {
    if (!id || !editForm.name) { toast.error("Vendor name is required."); return }
    setSaving(true)
    try {
      await Cr871_vendorsService.update(id, {
        cr871_vendorname: editForm.name,
        cr871_legalentityname: editForm.legal || undefined,
        cr871_rcnumber: editForm.rc || undefined,
        cr871_vendorcontactemail: editForm.contactEmail || undefined,
        cr871_primaryassessoremail: editForm.assessorEmail || undefined,
        cr871_vendornotes: editForm.notes || undefined,
      })
      toast.success("Vendor updated.")
      setShowEdit(false)
      await queryClient.invalidateQueries({ queryKey: ["cr871_vendors", id] })
    } catch {
      toast.error("Failed to update vendor.")
    } finally {
      setSaving(false)
    }
  }

  async function handleCreateAssessment() {
    if (!id || !assessForm.riskRating) { toast.error("Risk rating is required."); return }
    setSaving(true)
    try {
      await Cr871_assessmentsService.create({
        "cr871_VendorID@odata.bind": `/cr871_vendors(${id})`,
        cr871_vendorname: vendor?.cr871_vendorname,
        cr871_riskrating: Number(assessForm.riskRating) as never,
        cr871_duedate: assessForm.dueDate || undefined,
        cr871_assessoremail: assessForm.assessorEmail || undefined,
        cr871_vendorcontactemail: assessForm.vendorContactEmail || undefined,
        cr871_assessornotes: assessForm.notes || undefined,
        cr871_status: 144610000 as never, // Invited
        ownerid: "",
        owneridtype: "systemusers",
        statecode: 0,
      })
      toast.success("Assessment created.")
      setShowNewAssessment(false)
      setAssessForm({ riskRating: "", dueDate: "", assessorEmail: "", vendorContactEmail: "", notes: "" })
      await queryClient.invalidateQueries({ queryKey: ["cr871_assessments", "vendor", id] })
    } catch {
      toast.error("Failed to create assessment.")
    } finally {
      setSaving(false)
    }
  }

  if (vendorLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (!vendor) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/vendors")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Vendors
        </Button>
        <p className="text-muted-foreground">Vendor not found.</p>
      </div>
    )
  }

  const bandCode = vendor.cr871_currentriskband as unknown as number

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/vendors")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Vendors
        </Button>
      </div>

      {/* Vendor info card */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle className="text-xl">{vendor.cr871_vendorname}</CardTitle>
            {vendor.cr871_legalentityname && (
              <p className="text-sm text-muted-foreground mt-0.5">{vendor.cr871_legalentityname}</p>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={openEdit}>
            <PencilIcon className="mr-2 h-4 w-4" /> Edit
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-4 text-sm">
            <div>
              <p className="text-muted-foreground">RC Number</p>
              <p className="font-medium">{vendor.cr871_rcnumber ?? "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Risk Band</p>
              <RiskBadge code={bandCode} className="mt-1" />
            </div>
            <div>
              <p className="text-muted-foreground">Overall Score</p>
              <div className="mt-1">
                <ScoreBar score={vendor.cr871_currentoverallscore} thresholds={thresholds} />
              </div>
            </div>
            <div>
              <p className="text-muted-foreground">Vendor Contact</p>
              <p className="font-medium">{vendor.cr871_vendorcontactemail ?? "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Primary Assessor</p>
              <p className="font-medium">{vendor.cr871_primaryassessoremail ?? "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Last Assessed</p>
              <p className="font-medium">{formatDate(vendor.cr871_lastassesseddate)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Next Due</p>
              <p className="font-medium">{formatDate(vendor.cr871_nextassessmentdue)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Onboarded</p>
              <p className="font-medium">{formatDate(vendor.cr871_onboardeddate)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Assessments</p>
              <p className="font-medium">{vendor.cr871_assessmentcount ?? 0}</p>
            </div>
          </div>
          {vendor.cr871_vendornotes && (
            <div className="mt-4 pt-4 border-t">
              <p className="text-muted-foreground text-sm">Notes</p>
              <p className="mt-1 text-sm whitespace-pre-wrap">{vendor.cr871_vendornotes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Assessments table */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Assessments</h2>
          <Button size="sm" onClick={() => setShowNewAssessment(true)}>
            <PlusIcon className="mr-2 h-4 w-4" /> New Assessment
          </Button>
        </div>
        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="border-b">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Score</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Due Date</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Submitted</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Decision</th>
              </tr>
            </thead>
            <tbody>
              {assessmentsLoading ? (
                Array(3).fill(null).map((_, i) => (
                  <tr key={i} className="border-b">
                    {Array(5).fill(null).map((__, j) => (
                      <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                    ))}
                  </tr>
                ))
              ) : assessments.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    No assessments yet.
                  </td>
                </tr>
              ) : (
                assessments.map(a => {
                  const statusCode = a.cr871_status as unknown as number
                  const decisionCode = a.cr871_finaldecision as unknown as number
                  return (
                    <tr
                      key={a.cr871_assessmentid}
                      className="border-b last:border-0 hover:bg-muted/50 cursor-pointer"
                      onClick={() => navigate(`/assessments/${a.cr871_assessmentid}`)}
                    >
                      <td className="px-4 py-3">
                        <span className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                          ASSESSMENT_STATUS_COLOR[statusCode] ?? ""
                        )}>
                          {ASSESSMENT_STATUS_LABEL[statusCode] ?? "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <ScoreBar score={a.cr871_overallscore} thresholds={thresholds} />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(a.cr871_duedate)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(a.cr871_submitdate)}</td>
                      <td className="px-4 py-3">{FINAL_DECISION_LABEL[decisionCode] ?? "—"}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit vendor dialog */}
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Edit Vendor</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            {[
              { label: "Vendor Name", key: "name", required: true },
              { label: "Legal Entity Name", key: "legal" },
              { label: "RC Number", key: "rc" },
              { label: "Vendor Contact Email", key: "contactEmail" },
              { label: "Primary Assessor Email", key: "assessorEmail" },
            ].map(({ label, key, required }) => (
              <div key={key} className="space-y-1.5">
                <Label>{label}{required && <span className="text-destructive"> *</span>}</Label>
                <Input
                  value={editForm[key as keyof typeof editForm]}
                  onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                />
              </div>
            ))}
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea
                value={editForm.notes}
                onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEdit(false)}>Cancel</Button>
            <Button onClick={handleSaveVendor} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New assessment dialog */}
      <Dialog open={showNewAssessment} onOpenChange={setShowNewAssessment}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>New Assessment</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5">
              <Label>Risk Rating <span className="text-destructive">*</span></Label>
              <Select value={assessForm.riskRating} onValueChange={v => setAssessForm(f => ({ ...f, riskRating: v }))}>
                <SelectTrigger><SelectValue placeholder="Select rating…" /></SelectTrigger>
                <SelectContent>
                  {RISK_RATING_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Due Date</Label>
              <Input type="date" value={assessForm.dueDate} onChange={e => setAssessForm(f => ({ ...f, dueDate: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Assessor Email</Label>
              <Input type="email" value={assessForm.assessorEmail} onChange={e => setAssessForm(f => ({ ...f, assessorEmail: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Vendor Contact Email</Label>
              <Input type="email" value={assessForm.vendorContactEmail} onChange={e => setAssessForm(f => ({ ...f, vendorContactEmail: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea rows={2} value={assessForm.notes} onChange={e => setAssessForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewAssessment(false)}>Cancel</Button>
            <Button onClick={handleCreateAssessment} disabled={saving}>{saving ? "Saving…" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

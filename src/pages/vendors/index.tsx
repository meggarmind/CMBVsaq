import { useState, useMemo } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  useReactTable, getCoreRowModel, getSortedRowModel,
  getFilteredRowModel, getPaginationRowModel,
  flexRender, type ColumnDef, type SortingState, type PaginationState,
} from "@tanstack/react-table"
import { toast } from "sonner"
import { PlusIcon, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { RiskBadge } from "@/components/risk-badge"
import { ScoreBar } from "@/components/score-bar"
import { Cr871_vendorsService } from "@/generated/services/Cr871_vendorsService"
import { Cr871_assessmentsService } from "@/generated/services/Cr871_assessmentsService"
import { Cr871_appusersService } from "@/generated/services/Cr871_appusersService"
import type { Cr871_vendors } from "@/generated/models/Cr871_vendorsModel"
import {
  RISK_RATING_LABEL, VENDOR_STATUS_LABEL, formatDate,
} from "@/lib/labels"
import { useSettingsStore } from "@/stores/settings-store"
import { DEFAULT_THRESHOLDS } from "@/lib/scoring"

const PAGE_SIZE = 15

const RISK_RATING_OPTIONS = [
  { value: "144610000", label: "Critical" },
  { value: "144610001", label: "High" },
  { value: "144610002", label: "Medium" },
  { value: "144610003", label: "Low" },
]

type FormState = {
  name: string; legal: string; rc: string; contactEmail: string
  assessorEmail: string; riskRating: string; dueDate: string; notes: string
}
const EMPTY_FORM: FormState = {
  name: "", legal: "", rc: "", contactEmail: "",
  assessorEmail: "", riskRating: "", dueDate: "", notes: "",
}

async function triggerInviteFlow(assessmentId: string, flowUrl: string) {
  if (!flowUrl) return
  try {
    await fetch(flowUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assessmentId }),
    })
  } catch {
    // best-effort — record creation already succeeded
  }
}

export default function VendorsPage() {
  const queryClient = useQueryClient()
  const settingsStore = useSettingsStore()
  const thresholds = {
    lowMin: settingsStore.getNumber("RiskBand_LowRisk_Min", DEFAULT_THRESHOLDS.lowMin),
    medMin: settingsStore.getNumber("RiskBand_MediumRisk_Min", DEFAULT_THRESHOLDS.medMin),
    highMin: settingsStore.getNumber("RiskBand_HighRisk_Min", DEFAULT_THRESHOLDS.highMin),
  }

  // Table
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState("")
  const [ratingFilter, setRatingFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: PAGE_SIZE })

  // Profile panel
  const [profileOpen, setProfileOpen] = useState(false)
  const [profileVendorId, setProfileVendorId] = useState<string | null>(null)

  // Registration panel
  const [registerOpen, setRegisterOpen] = useState(false)
  const [registerVendorId, setRegisterVendorId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [formErrors, setFormErrors] = useState<{ rc?: string; assessorEmail?: string }>({})
  const [saving, setSaving] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ["cr871_vendors", "active"],
    queryFn: () => Cr871_vendorsService.getAll({
      filter: "statecode eq 0",
      orderBy: ["cr871_vendorname asc"],
    }),
  })

  const allVendors = useMemo(() => data?.data ?? [], [data])

  const filteredVendors = useMemo(() => {
    let result = allVendors
    if (ratingFilter !== "all")
      result = result.filter(v => (v.cr871_currentriskrating as unknown as number) === Number(ratingFilter))
    if (statusFilter !== "all")
      result = result.filter(v => (v.cr871_vendorstatus as unknown as number) === Number(statusFilter))
    return result
  }, [allVendors, ratingFilter, statusFilter])

  const profileVendor = useMemo(
    () => allVendors.find(v => v.cr871_vendorid === profileVendorId) ?? null,
    [allVendors, profileVendorId],
  )

  const columns: ColumnDef<Cr871_vendors>[] = [
    {
      accessorKey: "cr871_vendorname",
      header: "Vendor Name",
      cell: ({ row }) => <span className="font-medium">{row.original.cr871_vendorname ?? "—"}</span>,
    },
    {
      accessorKey: "cr871_rcnumber",
      header: "RC Number",
      cell: ({ row }) => row.original.cr871_rcnumber ?? "—",
    },
    {
      accessorKey: "cr871_currentriskrating",
      header: "Current Risk Rating",
      cell: ({ row }) => {
        const code = row.original.cr871_currentriskrating as unknown as number
        return RISK_RATING_LABEL[code] ?? "—"
      },
    },
    {
      accessorKey: "cr871_currentoverallscore",
      header: "Overall Score",
      cell: ({ row }) => <ScoreBar score={row.original.cr871_currentoverallscore} thresholds={thresholds} />,
    },
    {
      accessorKey: "cr871_lastassesseddate",
      header: "Last Assessed",
      cell: ({ row }) => <span className="text-muted-foreground">{formatDate(row.original.cr871_lastassesseddate)}</span>,
    },
    {
      accessorKey: "cr871_nextassessmentdue",
      header: "Next Due",
      cell: ({ row }) => <span className="text-muted-foreground">{formatDate(row.original.cr871_nextassessmentdue)}</span>,
    },
    {
      accessorKey: "cr871_vendorstatus",
      header: "Status",
      cell: ({ row }) => {
        const code = row.original.cr871_vendorstatus as unknown as number
        return VENDOR_STATUS_LABEL[code] ?? "—"
      },
    },
  ]

  const table = useReactTable({
    data: filteredVendors,
    columns,
    state: { sorting, globalFilter, pagination },
    onSortingChange: setSorting,
    onGlobalFilterChange: v => { setGlobalFilter(v); setPagination(p => ({ ...p, pageIndex: 0 })) },
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  })

  function openRegisterNew() {
    setForm(EMPTY_FORM)
    setFormErrors({})
    setRegisterVendorId(null)
    setRegisterOpen(true)
  }

  function openInitiateAssessment(vendor: Cr871_vendors) {
    setForm({
      name: vendor.cr871_vendorname ?? "",
      legal: vendor.cr871_legalentityname ?? "",
      rc: vendor.cr871_rcnumber ?? "",
      contactEmail: vendor.cr871_vendorcontactemail ?? "",
      assessorEmail: vendor.cr871_primaryassessoremail ?? "",
      riskRating: String((vendor.cr871_currentriskrating as unknown as number) ?? ""),
      dueDate: "",
      notes: vendor.cr871_vendornotes ?? "",
    })
    setFormErrors({})
    setRegisterVendorId(vendor.cr871_vendorid)
    setProfileOpen(false)
    setRegisterOpen(true)
  }

  function setField(key: keyof FormState, value: string) {
    setForm(f => ({ ...f, [key]: value }))
    if (key === "rc") setFormErrors(e => ({ ...e, rc: undefined }))
    if (key === "assessorEmail") setFormErrors(e => ({ ...e, assessorEmail: undefined }))
  }

  function closeRegister() {
    setRegisterOpen(false)
    setForm(EMPTY_FORM)
    setFormErrors({})
  }

  async function handleSave() {
    if (
      !form.name.trim() || !form.legal.trim() || !form.rc.trim() ||
      !form.contactEmail.trim() || !form.assessorEmail.trim() ||
      !form.riskRating || !form.dueDate
    ) {
      toast.error("Please fill in all required fields.")
      return
    }

    setSaving(true)
    setFormErrors({})

    try {
      let vendorId = registerVendorId

      if (!vendorId) {
        const rcCheck = await Cr871_vendorsService.getAll({
          filter: `cr871_rcnumber eq '${form.rc.trim()}' and statecode eq 0`,
          top: 1,
        })
        if (rcCheck.data && rcCheck.data.length > 0) {
          setFormErrors(e => ({ ...e, rc: "A vendor with this RC Number already exists." }))
          setSaving(false)
          return
        }
      }

      const assessorCheck = await Cr871_appusersService.getAll({
        filter: `cr871_email eq '${form.assessorEmail.trim()}' and statecode eq 0`,
        top: 1,
      })
      if (!assessorCheck.data || assessorCheck.data.length === 0) {
        setFormErrors(e => ({ ...e, assessorEmail: "No active app user found with this email." }))
        setSaving(false)
        return
      }

      if (!vendorId) {
        const vendorResult = await Cr871_vendorsService.create({
          cr871_vendorname: form.name.trim(),
          cr871_legalentityname: form.legal.trim(),
          cr871_rcnumber: form.rc.trim(),
          cr871_vendorcontactemail: form.contactEmail.trim(),
          cr871_primaryassessoremail: form.assessorEmail.trim(),
          cr871_currentriskrating: Number(form.riskRating) as never,
          cr871_vendornotes: form.notes.trim() || undefined,
          ownerid: "",
          owneridtype: "systemusers",
          statecode: 0,
        })
        vendorId = vendorResult.data?.cr871_vendorid ?? null
        if (!vendorId) throw new Error("Vendor ID missing after creation.")
      }

      const assessmentResult = await Cr871_assessmentsService.create({
        "cr871_VendorID@odata.bind": `/cr871_vendors(${vendorId})`,
        cr871_vendorname: form.name.trim(),
        cr871_riskrating: Number(form.riskRating) as never,
        cr871_duedate: form.dueDate,
        cr871_assessoremail: form.assessorEmail.trim(),
        cr871_vendorcontactemail: form.contactEmail.trim(),
        cr871_assessornotes: form.notes.trim() || undefined,
        cr871_status: 144610000 as never, // Invited
        cr871_invitedate: new Date().toISOString(),
        ownerid: "",
        owneridtype: "systemusers",
        statecode: 0,
      })

      const newAssessmentId = assessmentResult.data?.cr871_assessmentid
      toast.success(registerVendorId ? "New assessment created." : "Vendor registered and assessment created.")
      closeRegister()
      await queryClient.invalidateQueries({ queryKey: ["cr871_vendors"] })

      if (newAssessmentId) {
        void triggerInviteFlow(newAssessmentId, settingsStore.get("Flow_InviteURL", ""))
      }
    } catch {
      toast.error("Save failed. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  const totalFiltered = table.getFilteredRowModel().rows.length
  const pageCount = table.getPageCount()
  const pageStart = pagination.pageIndex * PAGE_SIZE + 1
  const pageEnd = Math.min((pagination.pageIndex + 1) * PAGE_SIZE, totalFiltered)

  const isReassess = !!registerVendorId

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Vendors</h1>
        <Button onClick={openRegisterNew}>
          <PlusIcon className="mr-2 h-4 w-4" />
          Register New Vendor
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search vendors…"
          value={globalFilter}
          onChange={e => {
            setGlobalFilter(e.target.value)
            setPagination(p => ({ ...p, pageIndex: 0 }))
          }}
          className="max-w-xs"
        />
        <Select
          value={ratingFilter}
          onValueChange={v => { setRatingFilter(v); setPagination(p => ({ ...p, pageIndex: 0 })) }}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All Risk Ratings" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Risk Ratings</SelectItem>
            {RISK_RATING_OPTIONS.map(o => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={statusFilter}
          onValueChange={v => { setStatusFilter(v); setPagination(p => ({ ...p, pageIndex: 0 })) }}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {Object.entries(VENDOR_STATUS_LABEL).map(([code, label]) => (
              <SelectItem key={code} value={code}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id} className="border-b">
                {hg.headers.map(header => (
                  <th
                    key={header.id}
                    className="text-left px-4 py-3 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground"
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {header.column.getIsSorted() === "asc" ? " ↑" : header.column.getIsSorted() === "desc" ? " ↓" : ""}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {isLoading ? (
              Array(8).fill(null).map((_, i) => (
                <tr key={i} className="border-b">
                  {columns.map((_, j) => (
                    <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                  ))}
                </tr>
              ))
            ) : table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-muted-foreground">
                  No vendors found.
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map(row => (
                <tr
                  key={row.id}
                  className="border-b last:border-0 hover:bg-muted/50 cursor-pointer"
                  onClick={() => {
                    setProfileVendorId(row.original.cr871_vendorid)
                    setProfileOpen(true)
                  }}
                >
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} className="px-4 py-3">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pageCount > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Showing {pageStart}–{pageEnd} of {totalFiltered}</span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-2">Page {pagination.pageIndex + 1} of {pageCount}</span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Vendor Profile Panel */}
      <Sheet open={profileOpen} onOpenChange={setProfileOpen}>
        <SheetContent side="right" className="w-full sm:max-w-[480px] overflow-y-auto">
          {profileVendor ? (
            <>
              <SheetHeader className="pb-4">
                <SheetTitle>{profileVendor.cr871_vendorname}</SheetTitle>
                {profileVendor.cr871_legalentityname && (
                  <p className="text-sm text-muted-foreground">{profileVendor.cr871_legalentityname}</p>
                )}
              </SheetHeader>
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                  <ProfileField label="RC Number" value={profileVendor.cr871_rcnumber} />
                  <ProfileField label="Status" value={VENDOR_STATUS_LABEL[profileVendor.cr871_vendorstatus as unknown as number]} />
                  <ProfileField label="Risk Rating" value={RISK_RATING_LABEL[profileVendor.cr871_currentriskrating as unknown as number]} />
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Risk Band</p>
                    <RiskBadge code={profileVendor.cr871_currentriskband as unknown as number} />
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground mb-1">Overall Score</p>
                    <ScoreBar score={profileVendor.cr871_currentoverallscore} thresholds={thresholds} />
                  </div>
                  <ProfileField label="Last Assessed" value={formatDate(profileVendor.cr871_lastassesseddate)} />
                  <ProfileField label="Next Due" value={formatDate(profileVendor.cr871_nextassessmentdue)} />
                  <ProfileField label="Onboarded" value={formatDate(profileVendor.cr871_onboardeddate)} />
                  <ProfileField label="Assessment Count" value={String(profileVendor.cr871_assessmentcount ?? 0)} />
                  <ProfileField label="Vendor Contact" value={profileVendor.cr871_vendorcontactemail} />
                  <ProfileField label="Primary Assessor" value={profileVendor.cr871_primaryassessoremail} />
                </div>
                {profileVendor.cr871_vendornotes && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Notes</p>
                      <p className="text-sm whitespace-pre-wrap">{profileVendor.cr871_vendornotes}</p>
                    </div>
                  </>
                )}
                <Separator />
                <Button className="w-full" onClick={() => openInitiateAssessment(profileVendor)}>
                  Initiate New Assessment
                </Button>
              </div>
            </>
          ) : (
            <p className="pt-6 text-sm text-muted-foreground">No vendor selected.</p>
          )}
        </SheetContent>
      </Sheet>

      {/* Registration Form Panel */}
      <Sheet open={registerOpen} onOpenChange={open => { if (!open) closeRegister() }}>
        <SheetContent side="right" className="w-full sm:max-w-[520px] overflow-y-auto">
          <SheetHeader className="pb-4">
            <SheetTitle>{isReassess ? "Initiate New Assessment" : "Register New Vendor"}</SheetTitle>
          </SheetHeader>
          <div className="space-y-4">
            <FormField label="Vendor Name" required>
              <Input
                value={form.name}
                onChange={e => setField("name", e.target.value)}
                disabled={isReassess}
              />
            </FormField>
            <FormField label="Legal Entity Name" required>
              <Input
                value={form.legal}
                onChange={e => setField("legal", e.target.value)}
                disabled={isReassess}
              />
            </FormField>
            <FormField label="RC Number" required error={formErrors.rc}>
              <Input
                value={form.rc}
                onChange={e => setField("rc", e.target.value)}
                disabled={isReassess}
                className={formErrors.rc ? "border-destructive focus-visible:ring-destructive" : ""}
              />
            </FormField>
            <FormField label="Primary Contact Email" required>
              <Input
                type="email"
                value={form.contactEmail}
                onChange={e => setField("contactEmail", e.target.value)}
              />
            </FormField>
            <FormField label="Assessor Email" required error={formErrors.assessorEmail}>
              <Input
                type="email"
                value={form.assessorEmail}
                onChange={e => setField("assessorEmail", e.target.value)}
                className={formErrors.assessorEmail ? "border-destructive focus-visible:ring-destructive" : ""}
              />
            </FormField>
            <FormField label="Risk Rating" required>
              <Select value={form.riskRating} onValueChange={v => setField("riskRating", v)}>
                <SelectTrigger><SelectValue placeholder="Select rating…" /></SelectTrigger>
                <SelectContent>
                  {RISK_RATING_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Assessment Due Date" required>
              <Input
                type="date"
                value={form.dueDate}
                onChange={e => setField("dueDate", e.target.value)}
              />
            </FormField>
            <FormField label="Vendor Notes">
              <Textarea
                value={form.notes}
                onChange={e => setField("notes", e.target.value)}
                disabled={isReassess}
                rows={3}
              />
            </FormField>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={closeRegister}>
                Cancel
              </Button>
              <Button className="flex-1" onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

function ProfileField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className="text-sm font-medium">{value || "—"}</p>
    </div>
  )
}

function FormField({
  label, required, error, children,
}: {
  label: string
  required?: boolean
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

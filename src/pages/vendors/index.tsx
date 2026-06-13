import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import {
  useReactTable, getCoreRowModel, getSortedRowModel, getFilteredRowModel,
  flexRender, type ColumnDef, type SortingState,
} from "@tanstack/react-table"
import { toast } from "sonner"
import { PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { RiskBadge } from "@/components/risk-badge"
import { ScoreBar } from "@/components/score-bar"
import { Cr871_vendorsService } from "@/generated/services/Cr871_vendorsService"
import type { Cr871_vendors } from "@/generated/models/Cr871_vendorsModel"
import { RISK_BAND_LABEL, VENDOR_STATUS_LABEL, formatDate } from "@/lib/labels"
import { useSettingsStore } from "@/stores/settings-store"
import { DEFAULT_THRESHOLDS } from "@/lib/scoring"

const RISK_RATING_OPTIONS = [
  { value: "144610000", label: "Critical" },
  { value: "144610001", label: "High" },
  { value: "144610002", label: "Medium" },
  { value: "144610003", label: "Low" },
]

export default function VendorsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState("")
  const [bandFilter, setBandFilter] = useState<string>("all")
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: "", legal: "", rc: "", contactEmail: "", assessorEmail: "", riskRating: "",
  })

  const settingsStore = useSettingsStore()
  const thresholds = {
    lowMin: settingsStore.getNumber("RiskBand_LowRisk_Min", DEFAULT_THRESHOLDS.lowMin),
    medMin: settingsStore.getNumber("RiskBand_MediumRisk_Min", DEFAULT_THRESHOLDS.medMin),
    highMin: settingsStore.getNumber("RiskBand_HighRisk_Min", DEFAULT_THRESHOLDS.highMin),
  }

  const { data, isLoading } = useQuery({
    queryKey: ["cr871_vendors", "active"],
    queryFn: () => Cr871_vendorsService.getAll({ filter: "statecode eq 0", orderBy: ["cr871_vendorname asc"] }),
  })

  const allVendors = data?.data ?? []
  const vendors = bandFilter === "all"
    ? allVendors
    : allVendors.filter(v => (v.cr871_currentriskband as unknown as number) === Number(bandFilter))

  const columns: ColumnDef<Cr871_vendors>[] = [
    {
      accessorKey: "cr871_vendorname",
      header: "Vendor Name",
      cell: ({ row }) => (
        <span className="font-medium">{row.original.cr871_vendorname ?? "—"}</span>
      ),
    },
    {
      accessorKey: "cr871_rcnumber",
      header: "RC #",
      cell: ({ row }) => row.original.cr871_rcnumber ?? "—",
    },
    {
      accessorKey: "cr871_currentriskband",
      header: "Risk Band",
      cell: ({ row }) => {
        const code = row.original.cr871_currentriskband as unknown as number
        return <RiskBadge code={code} />
      },
    },
    {
      accessorKey: "cr871_currentoverallscore",
      header: "Score",
      cell: ({ row }) => (
        <ScoreBar score={row.original.cr871_currentoverallscore} thresholds={thresholds} />
      ),
    },
    {
      accessorKey: "cr871_lastassesseddate",
      header: "Last Assessed",
      cell: ({ row }) => formatDate(row.original.cr871_lastassesseddate),
    },
    {
      accessorKey: "cr871_nextassessmentdue",
      header: "Next Due",
      cell: ({ row }) => formatDate(row.original.cr871_nextassessmentdue),
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
    data: vendors,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  async function handleAddVendor() {
    if (!form.name || !form.riskRating) {
      toast.error("Vendor name and risk rating are required.")
      return
    }
    setSaving(true)
    try {
      await Cr871_vendorsService.create({
        cr871_vendorname: form.name,
        cr871_legalentityname: form.legal || undefined,
        cr871_rcnumber: form.rc || undefined,
        cr871_vendorcontactemail: form.contactEmail || undefined,
        cr871_primaryassessoremail: form.assessorEmail || undefined,
        cr871_currentriskrating: Number(form.riskRating) as never,
        ownerid: "",
        owneridtype: "systemusers",
        statecode: 0,
      })
      toast.success("Vendor added.")
      setShowAdd(false)
      setForm({ name: "", legal: "", rc: "", contactEmail: "", assessorEmail: "", riskRating: "" })
      await queryClient.invalidateQueries({ queryKey: ["cr871_vendors"] })
    } catch {
      toast.error("Failed to add vendor.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Vendors</h1>
        <Button onClick={() => setShowAdd(true)}>
          <PlusIcon className="mr-2 h-4 w-4" />
          Add Vendor
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <Input
          placeholder="Search vendors…"
          value={globalFilter}
          onChange={e => setGlobalFilter(e.target.value)}
          className="max-w-xs"
        />
        <Select value={bandFilter} onValueChange={setBandFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All bands" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All bands</SelectItem>
            {Object.entries(RISK_BAND_LABEL).map(([code, label]) => (
              <SelectItem key={code} value={code}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

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
              Array(5).fill(null).map((_, i) => (
                <tr key={i} className="border-b">
                  {columns.map((_, j) => (
                    <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                  ))}
                </tr>
              ))
            ) : table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-muted-foreground">
                  No vendors found.
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map(row => (
                <tr
                  key={row.id}
                  className="border-b last:border-0 hover:bg-muted/50 cursor-pointer"
                  onClick={() => navigate(`/vendors/${row.original.cr871_vendorid}`)}
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

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Vendor</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5">
              <Label>Vendor Name <span className="text-destructive">*</span></Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Legal Entity Name</Label>
              <Input value={form.legal} onChange={e => setForm(f => ({ ...f, legal: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>RC Number</Label>
              <Input value={form.rc} onChange={e => setForm(f => ({ ...f, rc: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Vendor Contact Email</Label>
              <Input type="email" value={form.contactEmail} onChange={e => setForm(f => ({ ...f, contactEmail: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Primary Assessor Email</Label>
              <Input type="email" value={form.assessorEmail} onChange={e => setForm(f => ({ ...f, assessorEmail: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Risk Rating <span className="text-destructive">*</span></Label>
              <Select value={form.riskRating} onValueChange={v => setForm(f => ({ ...f, riskRating: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select rating…" />
                </SelectTrigger>
                <SelectContent>
                  {RISK_RATING_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={handleAddVendor} disabled={saving}>
              {saving ? "Saving…" : "Add Vendor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

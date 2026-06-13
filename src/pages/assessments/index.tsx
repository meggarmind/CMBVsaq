import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import {
  useReactTable, getCoreRowModel, getSortedRowModel, getFilteredRowModel,
  flexRender, type ColumnDef, type SortingState,
} from "@tanstack/react-table"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { RiskBadge } from "@/components/risk-badge"
import { ScoreBar } from "@/components/score-bar"
import { Cr871_assessmentsService } from "@/generated/services/Cr871_assessmentsService"
import type { Cr871_assessments } from "@/generated/models/Cr871_assessmentsModel"
import {
  ASSESSMENT_STATUS_LABEL, ASSESSMENT_STATUS_COLOR,
  RISK_RATING_LABEL, formatDate,
} from "@/lib/labels"
import { useSettingsStore } from "@/stores/settings-store"
import { DEFAULT_THRESHOLDS } from "@/lib/scoring"
import { cn } from "@/lib/utils"

const STATUS_OPTIONS = Object.entries(ASSESSMENT_STATUS_LABEL).map(([code, label]) => ({ value: code, label }))
const RATING_OPTIONS = Object.entries(RISK_RATING_LABEL).map(([code, label]) => ({ value: code, label }))

export default function AssessmentsPage() {
  const navigate = useNavigate()
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [ratingFilter, setRatingFilter] = useState("all")

  const settingsStore = useSettingsStore()
  const thresholds = {
    lowMin: settingsStore.getNumber("RiskBand_LowRisk_Min", DEFAULT_THRESHOLDS.lowMin),
    medMin: settingsStore.getNumber("RiskBand_MediumRisk_Min", DEFAULT_THRESHOLDS.medMin),
    highMin: settingsStore.getNumber("RiskBand_HighRisk_Min", DEFAULT_THRESHOLDS.highMin),
  }

  const { data, isLoading } = useQuery({
    queryKey: ["cr871_assessments", "all"],
    queryFn: () => Cr871_assessmentsService.getAll({
      filter: "statecode eq 0",
      orderBy: ["createdon desc"],
      top: 500,
    }),
  })

  const all = data?.data ?? []
  const filtered = all.filter((a: (typeof all)[0]) => {
    const statusCode = a.cr871_status as unknown as number
    const ratingCode = a.cr871_riskrating as unknown as number
    if (statusFilter !== "all" && statusCode !== Number(statusFilter)) return false
    if (ratingFilter !== "all" && ratingCode !== Number(ratingFilter)) return false
    return true
  })

  const columns: ColumnDef<Cr871_assessments>[] = [
    {
      accessorKey: "cr871_vendorname",
      header: "Vendor",
      cell: ({ row }) => <span className="font-medium">{row.original.cr871_vendorname ?? "—"}</span>,
    },
    {
      accessorKey: "cr871_assessmentid1",
      header: "Assessment ID",
      cell: ({ row }) => (
        <span className="text-muted-foreground font-mono text-xs">
          {row.original.cr871_assessmentid1 ?? row.original.cr871_assessmentid.slice(0, 8)}
        </span>
      ),
    },
    {
      accessorKey: "cr871_status",
      header: "Status",
      cell: ({ row }) => {
        const code = row.original.cr871_status as unknown as number
        return (
          <span className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
            ASSESSMENT_STATUS_COLOR[code] ?? ""
          )}>
            {ASSESSMENT_STATUS_LABEL[code] ?? "—"}
          </span>
        )
      },
    },
    {
      accessorKey: "cr871_riskrating",
      header: "Risk Rating",
      cell: ({ row }) => {
        const code = row.original.cr871_riskrating as unknown as number
        const bandMap: Record<number, number> = {
          144610000: 144610003, // Critical → CriticalRisk band code
          144610001: 144610002,
          144610002: 144610001,
          144610003: 144610000,
        }
        return <RiskBadge code={bandMap[code]} label={RISK_RATING_LABEL[code]} />
      },
    },
    {
      accessorKey: "cr871_overallscore",
      header: "Score",
      cell: ({ row }) => <ScoreBar score={row.original.cr871_overallscore} thresholds={thresholds} />,
    },
    {
      accessorKey: "cr871_duedate",
      header: "Due Date",
      cell: ({ row }) => formatDate(row.original.cr871_duedate),
    },
    {
      accessorKey: "cr871_submitdate",
      header: "Submitted",
      cell: ({ row }) => formatDate(row.original.cr871_submitdate),
    },
    {
      accessorKey: "cr871_assessoremail",
      header: "Assessor",
      cell: ({ row }) => row.original.cr871_assessoremail ?? "—",
    },
  ]

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Assessments</h1>

      <div className="flex items-center gap-3 flex-wrap">
        <Input
          placeholder="Search…"
          value={globalFilter}
          onChange={e => setGlobalFilter(e.target.value)}
          className="max-w-xs"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={ratingFilter} onValueChange={setRatingFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All ratings" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All ratings</SelectItem>
            {RATING_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id} className="border-b">
                {hg.headers.map(header => (
                  <th
                    key={header.id}
                    className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap cursor-pointer select-none hover:text-foreground"
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
                  No assessments found.
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map(row => (
                <tr
                  key={row.id}
                  className="border-b last:border-0 hover:bg-muted/50 cursor-pointer"
                  onClick={() => navigate(`/assessments/${row.original.cr871_assessmentid}`)}
                >
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} className="px-4 py-3 whitespace-nowrap">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

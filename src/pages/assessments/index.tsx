import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  useReactTable, getCoreRowModel, getSortedRowModel,
  flexRender, type ColumnDef, type SortingState,
} from "@tanstack/react-table"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
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

const IN_PROGRESS = 144610001
const LAPSED = 144610005

const RATING_BAND_MAP: Record<number, number> = {
  144610000: 144610003,
  144610001: 144610002,
  144610002: 144610001,
  144610003: 144610000,
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

export default function AssessmentsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const settingsStore = useSettingsStore()
  const thresholds = {
    lowMin: settingsStore.getNumber("RiskBand_LowRisk_Min", DEFAULT_THRESHOLDS.lowMin),
    medMin: settingsStore.getNumber("RiskBand_MediumRisk_Min", DEFAULT_THRESHOLDS.medMin),
    highMin: settingsStore.getNumber("RiskBand_HighRisk_Min", DEFAULT_THRESHOLDS.highMin),
  }

  const [sorting, setSorting] = useState<SortingState>([])
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [savingReminderId, setSavingReminderId] = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const { data, isLoading } = useQuery({
    queryKey: ["cr871_assessments", { search: debouncedSearch, status: statusFilter }],
    queryFn: () => {
      const parts = ["statecode eq 0"]
      if (statusFilter !== "all") parts.push(`cr871_status eq ${statusFilter}`)
      if (debouncedSearch.trim())
        parts.push(
          `(contains(cr871_vendorname,'${debouncedSearch.trim()}') or contains(cr871_assessmentid1,'${debouncedSearch.trim()}'))`
        )
      return Cr871_assessmentsService.getAll({
        filter: parts.join(" and "),
        orderBy: ["createdon desc"],
        top: 200,
      })
    },
  })

  const rows = data?.data ?? []

  async function handleSendReminder(a: Cr871_assessments) {
    const id = a.cr871_assessmentid
    setSavingReminderId(id)
    try {
      await Cr871_assessmentsService.update(id, {
        cr871_remindercount: ((a.cr871_remindercount ?? 0) + 1) as never,
      })
      await queryClient.invalidateQueries({ queryKey: ["cr871_assessments"] })
      void triggerFlow(settingsStore.get("Flow_ReminderURL", ""), id)
      toast.success("Reminder sent.")
    } catch {
      toast.error("Failed to send reminder.")
    } finally {
      setSavingReminderId(null)
    }
  }

  const columns: ColumnDef<Cr871_assessments>[] = [
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
      accessorKey: "cr871_vendorname",
      header: "Vendor Name",
      cell: ({ row }) => <span className="font-medium">{row.original.cr871_vendorname ?? "—"}</span>,
    },
    {
      accessorKey: "cr871_riskrating",
      header: "Risk Rating",
      cell: ({ row }) => {
        const code = row.original.cr871_riskrating as unknown as number
        return <RiskBadge code={RATING_BAND_MAP[code]} label={RISK_RATING_LABEL[code] ?? "—"} />
      },
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
      accessorKey: "cr871_overallscore",
      header: "Overall Score",
      cell: ({ row }) => <ScoreBar score={row.original.cr871_overallscore} thresholds={thresholds} />,
    },
    {
      accessorKey: "cr871_riskband",
      header: "Risk Band",
      cell: ({ row }) => <RiskBadge code={row.original.cr871_riskband as unknown as number} />,
    },
    {
      accessorKey: "cr871_submitdate",
      header: "Submit Date",
      cell: ({ row }) => <span>{formatDate(row.original.cr871_submitdate)}</span>,
    },
    {
      accessorKey: "cr871_duedate",
      header: "Due Date",
      cell: ({ row }) => <span>{formatDate(row.original.cr871_duedate)}</span>,
    },
    {
      accessorKey: "cr871_assessoremail",
      header: "Assessor Email",
      cell: ({ row }) => <span>{row.original.cr871_assessoremail ?? "—"}</span>,
    },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      cell: ({ row }) => {
        const code = row.original.cr871_status as unknown as number
        const id = row.original.cr871_assessmentid
        if (code !== IN_PROGRESS && code !== LAPSED) return null
        return (
          <Button
            size="sm"
            variant="outline"
            disabled={savingReminderId === id}
            onClick={e => { e.stopPropagation(); void handleSendReminder(row.original) }}
          >
            {savingReminderId === id ? "Sending…" : "Send Reminder"}
          </Button>
        )
      },
    },
  ]

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Assessments</h1>

      <div className="flex items-center gap-3 flex-wrap">
        <Input
          placeholder="Search by vendor name or assessment ID…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUS_OPTIONS.map(o => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
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
                    {header.column.getIsSorted() === "asc"
                      ? " ↑"
                      : header.column.getIsSorted() === "desc"
                        ? " ↓"
                        : ""}
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
                    <td key={j} className="px-4 py-3">
                      <Skeleton className="h-4 w-full" />
                    </td>
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

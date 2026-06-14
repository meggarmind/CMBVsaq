import { useState, useMemo, useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import {
  useReactTable, getCoreRowModel, getSortedRowModel, flexRender,
  type ColumnDef, type SortingState,
} from "@tanstack/react-table"
import { CalendarDays } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { RiskBadge } from "@/components/risk-badge"
import { ScoreBar } from "@/components/score-bar"
import { Cr871_vendorsService } from "@/generated/services/Cr871_vendorsService"
import { Cr871_assessmentsService } from "@/generated/services/Cr871_assessmentsService"
import type { Cr871_assessments } from "@/generated/models/Cr871_assessmentsModel"
import type { Cr871_vendors } from "@/generated/models/Cr871_vendorsModel"
import {
  ASSESSMENT_STATUS_LABEL, ASSESSMENT_STATUS_COLOR, RISK_RATING_LABEL,
  formatDate, formatScore,
} from "@/lib/labels"
import { useAuthStore } from "@/stores/auth-store"
import { useSettingsStore } from "@/stores/settings-store"
import { DEFAULT_THRESHOLDS, type BandThresholds } from "@/lib/scoring"
import { cn } from "@/lib/utils"

type Period = "month" | "quarter" | "year"
const TODAY = new Date().toISOString().split("T")[0]
const PERIOD_LABEL: Record<Period, string> = {
  month: "This Month",
  quarter: "This Quarter",
  year: "This Year",
}

function getPeriodStart(period: Period): string {
  const now = new Date()
  if (period === "month") return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0]
  if (period === "quarter") {
    const q = Math.floor(now.getMonth() / 3)
    return new Date(now.getFullYear(), q * 3, 1).toISOString().split("T")[0]
  }
  return `${now.getFullYear()}-01-01`
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const role = useAuthStore(s => s.role)
  const email = useAuthStore(s => s.email)
  const settingsStore = useSettingsStore()
  const thresholds = {
    lowMin: settingsStore.getNumber("RiskBand_LowRisk_Min", DEFAULT_THRESHOLDS.lowMin),
    medMin: settingsStore.getNumber("RiskBand_MediumRisk_Min", DEFAULT_THRESHOLDS.medMin),
    highMin: settingsStore.getNumber("RiskBand_HighRisk_Min", DEFAULT_THRESHOLDS.highMin),
  }

  const [period, setPeriod] = useState<Period>("month")
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [sorting, setSorting] = useState<SortingState>([])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const assessmentsFilter = useMemo(() => {
    const parts = ["statecode eq 0"]
    if (role === "Assessor" && email) parts.push(`cr871_assessoremail eq '${email}'`)
    if (debouncedSearch) parts.push(`contains(cr871_vendorname,'${debouncedSearch}')`)
    return parts.join(" and ")
  }, [role, email, debouncedSearch])

  const { data: vendorsResult, isLoading: vendorsLoading } = useQuery({
    queryKey: ["cr871_vendors", "active"],
    queryFn: () => Cr871_vendorsService.getAll({ filter: "statecode eq 0" }),
  })

  const { data: assessmentsResult, isLoading: assessmentsLoading } = useQuery({
    queryKey: ["cr871_assessments", "dashboard", role, email, debouncedSearch],
    queryFn: () => Cr871_assessmentsService.getAll({
      filter: assessmentsFilter,
      orderBy: ["modifiedon desc"],
      top: 500,
    }),
  })

  const vendors = useMemo(() => vendorsResult?.data ?? [], [vendorsResult?.data])
  const assessments = useMemo(() => assessmentsResult?.data ?? [], [assessmentsResult?.data])
  const startDate = useMemo(() => getPeriodStart(period), [period])

  // KPI derivations
  const activeCount = useMemo(() =>
    assessments.filter(a => {
      const s = a.cr871_status as unknown as number
      return s === 144610000 || s === 144610001
    }).length, [assessments])

  const awaitingCount = useMemo(() =>
    assessments.filter(a => {
      const s = a.cr871_status as unknown as number
      return s === 144610002 || s === 144610003
    }).length, [assessments])

  const overdueCount = useMemo(() =>
    assessments.filter(a => {
      const s = a.cr871_status as unknown as number
      return s === 144610001 && a.cr871_duedate !== undefined && a.cr871_duedate < TODAY
    }).length, [assessments])

  const periodComplete = useMemo(() =>
    assessments.filter(a => {
      const s = a.cr871_status as unknown as number
      return s === 144610004 && a.cr871_submitdate !== undefined && a.cr871_submitdate >= startDate
    }), [assessments, startDate])

  const avgScore = useMemo(() => {
    const scored = periodComplete.filter(a => a.cr871_overallscore !== undefined && a.cr871_overallscore !== null)
    if (scored.length === 0) return null
    return scored.reduce((sum, a) => sum + (a.cr871_overallscore ?? 0), 0) / scored.length
  }, [periodComplete])

  const avgScoreColor =
    avgScore === null ? "" :
    avgScore >= thresholds.lowMin ? "text-green-600 dark:text-green-400" :
    avgScore >= thresholds.medMin ? "text-amber-600 dark:text-amber-400" :
    "text-red-600 dark:text-red-400"

  // Top Vendors panel
  const periodVendorIds = useMemo(
    () => new Set(periodComplete.map(a => a._cr871_vendorid_value).filter((v): v is string => !!v)),
    [periodComplete]
  )
  const periodVendors = useMemo(
    () => vendors.filter(v => periodVendorIds.has(v.cr871_vendorid)),
    [vendors, periodVendorIds]
  )

  const lowest3 = useMemo(() =>
    [...periodVendors]
      .sort((a, b) => {
        const ba = a.cr871_currentriskband as unknown as number
        const bb = b.cr871_currentriskband as unknown as number
        if (ba !== bb) return ba - bb
        return (b.cr871_currentoverallscore ?? 0) - (a.cr871_currentoverallscore ?? 0)
      })
      .slice(0, 3),
    [periodVendors]
  )

  const highest3 = useMemo(() =>
    [...periodVendors]
      .sort((a, b) => {
        const ba = a.cr871_currentriskband as unknown as number
        const bb = b.cr871_currentriskband as unknown as number
        if (ba !== bb) return bb - ba
        return (a.cr871_currentoverallscore ?? 0) - (b.cr871_currentoverallscore ?? 0)
      })
      .slice(0, 3),
    [periodVendors]
  )

  // Assessment table columns
  const columns: ColumnDef<Cr871_assessments>[] = [
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
        return RISK_RATING_LABEL[code] ?? row.original.cr871_riskratingname ?? "—"
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
      cell: ({ row }) => <span className="tabular-nums">{formatScore(row.original.cr871_overallscore)}</span>,
    },
    {
      accessorKey: "cr871_riskband",
      header: "Risk Band",
      cell: ({ row }) => <RiskBadge code={row.original.cr871_riskband as unknown as number} />,
    },
    {
      accessorKey: "cr871_duedate",
      header: "Due Date",
      cell: ({ row }) => <span className="text-muted-foreground">{formatDate(row.original.cr871_duedate)}</span>,
    },
    {
      accessorKey: "cr871_assessoremail",
      header: "Assessor Email",
      cell: ({ row }) => <span className="text-muted-foreground text-xs">{row.original.cr871_assessoremail ?? "—"}</span>,
    },
  ]

  const table = useReactTable({
    data: assessments,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const kpiTiles = [
    { label: "Total Registered Vendors", value: vendors.length, loading: vendorsLoading, color: "", isPeriod: false },
    { label: "Active Assessments", value: activeCount, loading: assessmentsLoading, color: "text-blue-600 dark:text-blue-400", isPeriod: false },
    { label: "Awaiting Review", value: awaitingCount, loading: assessmentsLoading, color: "text-purple-600 dark:text-purple-400", isPeriod: false },
    { label: "Overdue", value: overdueCount, loading: assessmentsLoading, color: "text-red-600 dark:text-red-400", isPeriod: false },
    { label: "Completed This Period", value: periodComplete.length, loading: assessmentsLoading, color: "text-green-600 dark:text-green-400", isPeriod: true },
    {
      label: "Avg Risk Score This Period",
      value: avgScore !== null ? `${Math.round(avgScore)}%` : "—",
      loading: assessmentsLoading,
      color: avgScoreColor,
      isPeriod: true,
    },
  ]

  return (
    <div className="space-y-6">
      {/* Heading + period selector */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <Select value={period} onValueChange={v => setPeriod(v as Period)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="month">This Month</SelectItem>
            <SelectItem value="quarter">This Quarter</SelectItem>
            <SelectItem value="year">This Year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 6 KPI tiles */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {kpiTiles.map(({ label, value, loading, color, isPeriod }) => (
          <Card key={label}>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground leading-snug">{label}</CardTitle>
              {isPeriod && (
                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/60 mt-0.5">
                  <CalendarDays className="h-3 w-3" />
                  {PERIOD_LABEL[period]}
                </span>
              )}
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {loading ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <span className={cn("text-3xl font-bold tabular-nums", color)}>{value}</span>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Top Vendors panel */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TopVendorsCard
          title="Top 3 Lowest Risk"
          vendors={lowest3}
          thresholds={thresholds}
          loading={vendorsLoading || assessmentsLoading}
          periodLabel={PERIOD_LABEL[period]}
        />
        <TopVendorsCard
          title="Top 3 Highest Risk"
          vendors={highest3}
          thresholds={thresholds}
          loading={vendorsLoading || assessmentsLoading}
          periodLabel={PERIOD_LABEL[period]}
        />
      </div>

      {/* Assessment table */}
      <div className="space-y-3">
        <Input
          placeholder="Search by vendor name…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              {table.getHeaderGroups().map(hg => (
                <tr key={hg.id} className="border-b">
                  {hg.headers.map(header => (
                    <th
                      key={header.id}
                      className="text-left px-4 py-3 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground whitespace-nowrap"
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
              {assessmentsLoading ? (
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
      </div>
    </div>
  )
}

function TopVendorsCard({
  title, vendors, thresholds, loading, periodLabel,
}: {
  title: string
  vendors: Cr871_vendors[]
  thresholds: BandThresholds
  loading: boolean
  periodLabel: string
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center justify-between gap-2">
          {title}
          <span className="inline-flex items-center gap-1 text-[10px] font-normal text-muted-foreground/60 shrink-0">
            <CalendarDays className="h-3 w-3" />
            {periodLabel}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          Array(3).fill(null).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)
        ) : vendors.length === 0 ? (
          <p className="text-sm text-muted-foreground">No vendors qualify for this period.</p>
        ) : (
          vendors.map(v => (
            <div key={v.cr871_vendorid} className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{v.cr871_vendorname ?? "—"}</p>
                <RiskBadge code={v.cr871_currentriskband as unknown as number} className="mt-0.5" />
              </div>
              <div className="shrink-0 w-28">
                <ScoreBar score={v.cr871_currentoverallscore} thresholds={thresholds} />
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}

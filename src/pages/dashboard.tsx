import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { RiskBadge } from "@/components/risk-badge"
import { Cr871_vendorsService } from "@/generated/services/Cr871_vendorsService"
import { Cr871_assessmentsService } from "@/generated/services/Cr871_assessmentsService"
import { ASSESSMENT_STATUS_LABEL, ASSESSMENT_STATUS_COLOR, formatDate, formatScore } from "@/lib/labels"
import { cn } from "@/lib/utils"

const TODAY = new Date().toISOString().split("T")[0]

// Status groupings (numeric codes)
const STATUS_PENDING = [144610000, 144610001]   // Invited, InProgress
const STATUS_REVIEW  = [144610002, 144610003]   // Submitted, UnderReview
const STATUS_DONE    = [144610004]               // Complete

export default function DashboardPage() {
  const navigate = useNavigate()

  const { data: vendorsResult, isLoading: vendorsLoading } = useQuery({
    queryKey: ["cr871_vendors", "active"],
    queryFn: () => Cr871_vendorsService.getAll({ filter: "statecode eq 0" }),
  })

  const { data: assessmentsResult, isLoading: assessmentsLoading } = useQuery({
    queryKey: ["cr871_assessments", "all"],
    queryFn: () => Cr871_assessmentsService.getAll({
      filter: "statecode eq 0",
      orderBy: ["modifiedon desc"],
      top: 200,
    }),
  })

  const vendors = vendorsResult?.data ?? []
  const assessments = assessmentsResult?.data ?? []

  const vendorsByBand = {
    144610003: vendors.filter(v => (v.cr871_currentriskband as unknown as number) === 144610003).length,
    144610002: vendors.filter(v => (v.cr871_currentriskband as unknown as number) === 144610002).length,
    144610001: vendors.filter(v => (v.cr871_currentriskband as unknown as number) === 144610001).length,
    144610000: vendors.filter(v => (v.cr871_currentriskband as unknown as number) === 144610000).length,
  }

  const pendingCount  = assessments.filter(a => STATUS_PENDING.includes(a.cr871_status as unknown as number)).length
  const reviewCount   = assessments.filter(a => STATUS_REVIEW.includes(a.cr871_status as unknown as number)).length
  const completeCount = assessments.filter(a => STATUS_DONE.includes(a.cr871_status as unknown as number)).length
  const overdueCount  = assessments.filter(a => {
    const due = a.cr871_duedate
    const status = a.cr871_status as unknown as number
    return due !== undefined && due < TODAY && ![144610002, 144610003, 144610004, 144610005].includes(status)
  }).length

  const recent = [...assessments].slice(0, 8)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>

      {/* Vendor risk band summary */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wide">Vendor Risk Profile</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {(vendorsLoading ? Array(4).fill(null) : [
            { code: 144610003, label: "Critical" },
            { code: 144610002, label: "High" },
            { code: 144610001, label: "Medium" },
            { code: 144610000, label: "Low Risk" },
          ]).map((item, i) => (
            <Card key={item?.code ?? i}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {item ? <RiskBadge code={item.code} /> : <Skeleton className="h-5 w-20" />}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {vendorsLoading ? (
                  <Skeleton className="h-8 w-12" />
                ) : (
                  <span className="text-3xl font-bold">{vendorsByBand[item!.code as keyof typeof vendorsByBand]}</span>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Assessment status summary */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wide">Assessments</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Pending / In Progress", value: pendingCount, color: "text-blue-600 dark:text-blue-400" },
            { label: "Awaiting Review", value: reviewCount, color: "text-purple-600 dark:text-purple-400" },
            { label: "Complete", value: completeCount, color: "text-green-600 dark:text-green-400" },
            { label: "Overdue", value: overdueCount, color: "text-red-600 dark:text-red-400" },
          ].map(({ label, value, color }) => (
            <Card key={label}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
              </CardHeader>
              <CardContent>
                {assessmentsLoading ? (
                  <Skeleton className="h-8 w-12" />
                ) : (
                  <span className={cn("text-3xl font-bold", color)}>{value}</span>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Recent activity */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wide">Recent Activity</h2>
        <Card>
          <CardContent className="p-0">
            {assessmentsLoading ? (
              <div className="p-4 space-y-3">
                {Array(4).fill(null).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : recent.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">No assessments yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Vendor</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Score</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Due</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map(a => {
                    const statusCode = a.cr871_status as unknown as number
                    return (
                      <tr
                        key={a.cr871_assessmentid}
                        className="border-b last:border-0 hover:bg-muted/50 cursor-pointer"
                        onClick={() => navigate(`/assessments/${a.cr871_assessmentid}`)}
                      >
                        <td className="px-4 py-3 font-medium">{a.cr871_vendorname ?? "—"}</td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                            ASSESSMENT_STATUS_COLOR[statusCode] ?? "bg-gray-100 text-gray-600"
                          )}>
                            {ASSESSMENT_STATUS_LABEL[statusCode] ?? "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3 tabular-nums">{formatScore(a.cr871_overallscore)}</td>
                        <td className="px-4 py-3 text-muted-foreground">{formatDate(a.cr871_duedate)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

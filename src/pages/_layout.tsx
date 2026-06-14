import { Outlet, NavLink, useNavigate } from "react-router-dom"
import { useAuthStore } from "@/stores/auth-store"
import { ModeToggle } from "@/components/mode-toggle"
import { Skeleton } from "@/components/ui/skeleton"
import { useEffect } from "react"

const NAV_LINKS = [
  { to: "/dashboard", label: "Dashboard", roles: ["CISO", "Assessor"] },
  { to: "/vendors", label: "Vendors", roles: ["CISO", "Assessor"] },
  { to: "/assessments", label: "Assessments", roles: ["CISO", "Assessor"] },
  { to: "/settings", label: "Settings", roles: ["CISO"] },
]

export default function Layout() {
  const role = useAuthStore(s => s.role)
  const loading = useAuthStore(s => s.loading)
  const denied = useAuthStore(s => s.denied)
  const email = useAuthStore(s => s.email)
  const navigate = useNavigate()

  useEffect(() => {
    if (loading) return
    if (denied) {
      navigate("/access-denied", { replace: true })
    } else if (role === "Vendor") {
      navigate("/vendor-form", { replace: true })
    }
  }, [role, loading, denied, navigate])

  const visibleLinks = NAV_LINKS.filter(l => !role || l.roles.includes(role))

  return (
    <div className="min-h-dvh flex">
      <aside className="w-56 shrink-0 flex flex-col bg-sidebar text-sidebar-foreground">
        <div className="h-14 flex items-center px-5 border-b border-sidebar-border shrink-0">
          <span className="font-bold tracking-tight text-sidebar-primary">CMB VSAQ</span>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1">
          {loading ? (
            <>
              <Skeleton className="h-8 w-full opacity-20" />
              <Skeleton className="h-8 w-full opacity-20" />
              <Skeleton className="h-8 w-full opacity-20" />
            </>
          ) : (
            visibleLinks.map(link => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  isActive
                    ? "bg-sidebar-accent text-sidebar-primary font-semibold rounded-md px-3 py-2 text-sm block"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground rounded-md px-3 py-2 text-sm block transition-colors"
                }
              >
                {link.label}
              </NavLink>
            ))
          )}
        </nav>

        <div className="p-3 border-t border-sidebar-border flex items-center gap-2">
          <ModeToggle />
          {email && (
            <span className="text-xs text-sidebar-foreground/60 truncate min-w-0">{email}</span>
          )}
        </div>
      </aside>

      <main className="flex-1 min-w-0 overflow-auto">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

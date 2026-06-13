import { Outlet, NavLink, useNavigate } from "react-router-dom"
import { useAuthStore } from "@/stores/auth-store"
import { ModeToggle } from "@/components/mode-toggle"
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
  const navigate = useNavigate()

  // Redirect vendor users away from the main layout
  useEffect(() => {
    if (!loading && role === "Vendor") {
      navigate("/vendor-form", { replace: true })
    }
  }, [role, loading, navigate])

  const visibleLinks = NAV_LINKS.filter(l => !role || l.roles.includes(role))

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="h-14 border-b flex items-center shrink-0">
        <div className="mx-auto w-full max-w-7xl px-6 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <span className="font-semibold text-sm tracking-tight">CMB VSAQ</span>
            <nav className="flex items-center gap-1">
              {visibleLinks.map(link => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={({ isActive }) =>
                    `text-sm px-3 py-1.5 rounded-md transition-colors ${
                      isActive
                        ? "bg-accent text-foreground font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                    }`
                  }
                >
                  {link.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <ModeToggle />
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col">
        <div className="flex-1 mx-auto w-full max-w-7xl px-6 py-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

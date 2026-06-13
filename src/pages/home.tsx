import { useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { useAuthStore } from "@/stores/auth-store"

export default function HomePage() {
  const navigate = useNavigate()
  const role = useAuthStore(s => s.role)
  const loading = useAuthStore(s => s.loading)

  useEffect(() => {
    if (loading) return
    if (role === "Vendor") {
      navigate("/vendor-form", { replace: true })
    } else {
      navigate("/dashboard", { replace: true })
    }
  }, [role, loading, navigate])

  return (
    <div className="h-full grid place-items-center">
      <div className="text-muted-foreground text-sm">Loading…</div>
    </div>
  )
}

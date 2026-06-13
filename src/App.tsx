import { useEffect } from "react"
import { ThemeProvider } from "@/providers/theme-provider"
import { SonnerProvider } from "@/providers/sonner-provider"
import { QueryProvider } from "@/providers/query-provider"
import { RouterProvider } from "react-router-dom"
import { router } from "@/router"
import { useAuthStore } from "@/stores/auth-store"
import { useSettingsStore } from "@/stores/settings-store"
import { getContext } from "@microsoft/power-apps/app"

export default function App() {
  const initAuth = useAuthStore(s => s.init)
  const initSettings = useSettingsStore(s => s.init)

  useEffect(() => {
    void (async () => {
      const [ctx] = await Promise.all([getContext(), initSettings()])
      await initAuth(
        ctx.app.queryParams,
        ctx.user.userPrincipalName,
        ctx.user.objectId,
        ctx.user.fullName
      )
    })()
  }, [initAuth, initSettings])

  return (
    <ThemeProvider>
      <SonnerProvider>
        <QueryProvider>
          <RouterProvider router={router} />
        </QueryProvider>
      </SonnerProvider>
    </ThemeProvider>
  )
}

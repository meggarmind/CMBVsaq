import { create } from "zustand"
import { Cr871_appusersService } from "@/generated/services/Cr871_appusersService"

export type AppRole = "CISO" | "Assessor" | "Vendor"

interface AuthState {
  role: AppRole | null
  email: string | null
  name: string | null
  objectId: string | null
  assessmentId: string | null // set when role === 'Vendor'
  loading: boolean
  denied: boolean // true when user is authenticated but not in cr871_appusers
  init: (queryParams: Record<string, string>, userPrincipalName?: string, objectId?: string, fullName?: string) => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  role: null,
  email: null,
  name: null,
  objectId: null,
  assessmentId: null,
  loading: true,
  denied: false,

  init: async (queryParams, userPrincipalName, objectId, fullName) => {
    const aid = queryParams["aid"] ?? queryParams["AID"] ?? null

    if (aid) {
      set({ role: "Vendor", assessmentId: aid, loading: false })
      return
    }

    const email = userPrincipalName ?? null
    if (!email) {
      set({ role: null, loading: false })
      return
    }

    try {
      const result = await Cr871_appusersService.getAll({
        filter: `cr871_email eq '${email}' and statecode eq 0`,
        top: 1,
      })
      const user = result.data?.[0]
      if (!user) {
        set({ role: null, denied: true, email, name: fullName ?? null, objectId: objectId ?? null, loading: false })
        return
      }

      // cr871_role: 144610000 = CISO, 144610001 = Assessor
      const roleCode = user.cr871_role as unknown as number
      const role: AppRole = roleCode === 144610000 ? "CISO" : "Assessor"

      set({
        role,
        email: user.cr871_email ?? email,
        name: user.cr871_name ?? fullName ?? null,
        objectId: objectId ?? null,
        loading: false,
      })
    } catch {
      set({ role: null, email, name: fullName ?? null, objectId: objectId ?? null, loading: false })
    }
  },
}))

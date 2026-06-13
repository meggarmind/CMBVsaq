import { create } from "zustand"
import { Cr871_settingsService } from "@/generated/services/Cr871_settingsService"
import type { Cr871_settings } from "@/generated/models/Cr871_settingsModel"

const DEFAULTS: Record<string, string> = {
  RiskBand_LowRisk_Min: "80",
  RiskBand_MediumRisk_Min: "60",
  RiskBand_HighRisk_Min: "40",
  AssessFreq_Critical_Months: "6",
  AssessFreq_High_Months: "12",
  AssessFreq_Medium: "AdHoc",
  AssessFreq_Low: "AdHoc",
  Reminder_DaysBefore: "7",
  Reminder_MaxCount: "3",
  Reminder_IntervalDays: "7",
  Email_Invite_Body: "",
  Email_Reminder_Body: "",
  Email_Submission_Body: "",
  Admin_AlertEmail: "",
}

interface SettingsState {
  map: Record<string, string>
  records: Cr871_settings[]
  loading: boolean
  init: () => Promise<void>
  get: (key: string, fallback?: string) => string
  getNumber: (key: string, fallback: number) => number
  save: (key: string, value: string) => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  map: { ...DEFAULTS },
  records: [],
  loading: true,

  init: async () => {
    try {
      const result = await Cr871_settingsService.getAll({
        filter: "statecode eq 0",
      })
      const records = result.data ?? []
      const map: Record<string, string> = { ...DEFAULTS }
      for (const r of records) {
        if (r.cr871_setting1) map[r.cr871_setting1] = r.cr871_settingvalue ?? ""
      }
      set({ map, records, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  get: (key, fallback) => {
    const { map } = get()
    return map[key] ?? fallback ?? DEFAULTS[key] ?? ""
  },

  getNumber: (key, fallback) => {
    const val = get().get(key)
    const n = parseFloat(val)
    return isNaN(n) ? fallback : n
  },

  save: async (key, value) => {
    const { records } = get()
    const existing = records.find(r => r.cr871_setting1 === key)
    if (existing) {
      await Cr871_settingsService.update(existing.cr871_settingid, {
        cr871_settingvalue: value,
      })
      set(state => ({
        records: state.records.map(r =>
          r.cr871_settingid === existing.cr871_settingid
            ? { ...r, cr871_settingvalue: value }
            : r
        ),
        map: { ...state.map, [key]: value },
      }))
    } else {
      const result = await Cr871_settingsService.create({
        cr871_setting1: key,
        cr871_settingvalue: value,
        cr871_description: DEFAULTS[key] !== undefined ? key : undefined,
        ownerid: "",
        owneridtype: "systemusers",
        statecode: 0,
      })
      if (result.data) {
        set(state => ({
          records: [...state.records, result.data!],
          map: { ...state.map, [key]: value },
        }))
      }
    }
  },
}))

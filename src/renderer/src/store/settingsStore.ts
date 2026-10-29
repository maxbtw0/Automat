import { create } from 'zustand'
import { defaultSettings, type Settings } from '@shared/settings'

interface SettingsState {
  settings: Settings
  /** Ganze Einstellungen ersetzen (nach dem Laden oder „Speichern“ im Einstellungen-Fenster) */
  setSettings(settings: Settings): void
}

/** Einstellungen des Programms – gespeichert wird in `services/settingsActions`. */
export const useSettingsStore = create<SettingsState>((set) => ({
  settings: defaultSettings(),
  setSettings: (settings) => set({ settings })
}))

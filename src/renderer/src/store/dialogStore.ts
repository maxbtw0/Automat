import { create } from 'zustand'
import type { ExportTheme } from '@/export/svg'

export interface ChoiceRequest {
  title: string
  detail?: string
  /** Erster Knopf = Hauptaktion, letzter Knopf = Abbrechen (auch bei Esc) */
  buttons: string[]
  /** Index des Knopfs, der etwas verwirft oder löscht (rot) */
  danger?: number
}

interface DialogState {
  request: (ChoiceRequest & { resolve(index: number): void }) | null
  answer(index: number): void
  /** Kleines Fenster außerhalb des DialogHost offen (z. B. Zelle der Turing-Tabelle) */
  windowOpen: boolean
  setWindowOpen(open: boolean): void
  /** Export-Fenster offen */
  exportOpen: boolean
  setExportOpen(open: boolean): void
  /** Einstellungen-Fenster offen */
  settingsOpen: boolean
  setSettingsOpen(open: boolean): void
  /** Hilfe-Fenster offen */
  helpOpen: boolean
  setHelpOpen(open: boolean): void
  /** Zuletzt gewählter Farbmodus beim Export */
  exportTheme: ExportTheme
  setExportTheme(theme: ExportTheme): void
  /** Bildfolge mit Beschreibung pro Schritt */
  exportDescription: boolean
  setExportDescription(description: boolean): void
}

export const useDialogStore = create<DialogState>((set, get) => ({
  request: null,
  answer: (index) => {
    get().request?.resolve(index)
    set({ request: null })
  },
  windowOpen: false,
  setWindowOpen: (windowOpen) => set({ windowOpen }),
  exportOpen: false,
  setExportOpen: (exportOpen) => set({ exportOpen }),
  settingsOpen: false,
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  helpOpen: false,
  setHelpOpen: (helpOpen) => set({ helpOpen }),
  exportTheme: 'light',
  setExportTheme: (exportTheme) => set({ exportTheme }),
  exportDescription: false,
  setExportDescription: (exportDescription) => set({ exportDescription })
}))

/** Ist gerade ein Dialog offen? Dann ruhen die Tastenkürzel der Screens. */
export function isModalOpen(): boolean {
  const { request, exportOpen, settingsOpen, helpOpen, windowOpen } = useDialogStore.getState()
  return request !== null || exportOpen || settingsOpen || helpOpen || windowOpen
}

/** Zeigt einen Dialog im App-Stil und liefert den Index des gewählten Knopfs. */
export function askChoice(request: ChoiceRequest): Promise<number> {
  // Ein noch offener Dialog wird mit SEINEM Abbrechen-Knopf beendet
  const previous = useDialogStore.getState().request
  previous?.resolve(previous.buttons.length - 1)
  return new Promise((resolve) => useDialogStore.setState({ request: { ...request, resolve } }))
}

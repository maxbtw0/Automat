import type { Settings } from './settings'

/**
 * Gemeinsame Typen und Kanalnamen für die Kommunikation zwischen
 * Electron-Hauptprozess (main), Preload und Renderer.
 */

export const IpcChannels = {
  openFile: 'file:open',
  saveFile: 'file:save',
  exportSave: 'export:save',
  exportSequence: 'export:sequence',
  exportPdf: 'export:pdf',
  windowDirty: 'window:dirty',
  closeRequest: 'window:close-request',
  closeWindow: 'window:close',
  menuAction: 'menu:action',
  loadSettings: 'settings:load',
  saveSettings: 'settings:save'
} as const

/** Aktionen, die das native Menü an den Renderer schickt. */
export type MenuAction =
  | 'new'
  | 'open'
  | 'save'
  | 'saveAs'
  | 'undo'
  | 'redo'
  | 'delete'
  | 'export'
  | 'settings'
  | 'help'

export interface FileFilter {
  name: string
  extensions: string[]
}

export interface OpenFileResult {
  filePath: string
  content: string
}

/** Die API, die der Preload als `window.api` bereitstellt. */
export interface AutomatApi {
  openFile(): Promise<OpenFileResult | null>
  /** Speichert `content`. Ohne `filePath` wird ein Speichern-Dialog gezeigt. Liefert den Pfad oder `null` bei Abbruch. */
  saveFile(content: string, filePath: string | null): Promise<string | null>
  /** Export: speichert `data` über einen Speichern-Dialog. Liefert den Pfad oder `null`. */
  saveExport(defaultName: string, filter: FileFilter, data: Uint8Array): Promise<string | null>
  /**
   * Export einer Bildfolge: fragt nach einem Ordner und schreibt `baseName-01.ext`, `-02` …
   * Liefert den Ordner oder `null`.
   */
  saveExportSequence(
    baseName: string,
    extension: string,
    files: Uint8Array[]
  ): Promise<string | null>
  /** Export als PDF: `html` wird unsichtbar gerendert und gedruckt. Liefert den Pfad oder `null`. */
  exportPdf(defaultName: string, html: string): Promise<string | null>
  /** Meldet ungespeicherte Änderungen – nur dann fragt das Fenster beim Schließen nach. */
  setDirty(dirty: boolean): void
  /** Das Fenster soll schließen, hat aber ungespeicherte Änderungen. Liefert eine Abmelde-Funktion. */
  onCloseRequest(callback: () => void): () => void
  /** Schließt das Fenster ohne weitere Rückfrage. */
  closeWindow(): void
  /** Registriert einen Listener für Menü-Aktionen und liefert eine Abmelde-Funktion. */
  onMenuAction(callback: (action: MenuAction) => void): () => void
  /** Einstellungen aus AppData – Standard, wenn die Datei fehlt oder kaputt ist. */
  loadSettings(): Promise<Settings>
  /** Schreibt die Einstellungen und passt die Tastenkürzel im Menü an. */
  saveSettings(settings: Settings): Promise<void>
}

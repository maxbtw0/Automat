import type { Settings } from './settings'

/**
 * Gemeinsame Typen und Kanalnamen für die Kommunikation zwischen
 * Electron-Hauptprozess (main), Preload und Renderer.
 */

export const IpcChannels = {
  openFile: 'file:open',
  saveFile: 'file:save',
  exportSave: 'export:save',
  exportSequenceBegin: 'export:sequence-begin',
  exportSequenceWrite: 'export:sequence-write',
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
  | 'importAutoEdit'
  | 'save'
  | 'saveAs'
  | 'undo'
  | 'redo'
  | 'delete'
  | 'selectAll'
  | 'export'
  | 'settings'
  | 'help'

export interface FileFilter {
  name: string
  extensions: string[]
}

/** Was der Öffnen-Dialog anbietet: Automat-Dateien oder AutoEdit-Dateien (Import). */
export type OpenFileKind = 'automat' | 'autoEdit'

export interface OpenFileResult {
  filePath: string
  /** Die Bytes der Datei – dekodiert wird im Renderer (`decodeFileText`) */
  data: Uint8Array
}

/** Eine begonnene Bildfolge: Nummer des Auftrags und der neu angelegte Ordner der Serie */
export interface ExportSequence {
  id: number
  folder: string
}

/** Die API, die der Preload als `window.api` bereitstellt. */
export interface AutomatApi {
  openFile(kind?: OpenFileKind): Promise<OpenFileResult | null>
  /** Pfad einer ins Fenster gezogenen Datei, `''` wenn sie keinen hat. */
  pathForFile(file: File): string
  /** Speichert `content`. Ohne `filePath` wird ein Speichern-Dialog gezeigt. Liefert den Pfad oder `null` bei Abbruch. */
  saveFile(content: string, filePath: string | null): Promise<string | null>
  /** Export: speichert `data` über einen Speichern-Dialog. Liefert den Pfad oder `null`. */
  saveExport(defaultName: string, filter: FileFilter, data: Uint8Array): Promise<string | null>
  /**
   * Export einer Bildfolge mit `count` Bildern: fragt nach einem Ordner, legt darin einen neuen
   * Ordner `baseName` (bzw. `baseName (2)` …) an und liefert ihn mit der Nummer des Auftrags oder
   * `null`. Die Bilder schreibt danach `writeExportSequence` einzeln als `baseName-01.ext` …
   */
  beginExportSequence(
    baseName: string,
    extension: string,
    count: number
  ): Promise<ExportSequence | null>
  /**
   * Schreibt Bild Nr. `index` (ab 0) der Bildfolge `id`. Wirft, wenn inzwischen eine andere
   * Bildfolge begonnen wurde.
   */
  writeExportSequence(id: number, index: number, data: Uint8Array): Promise<void>
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

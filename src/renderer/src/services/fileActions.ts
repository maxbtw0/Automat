import type { MenuAction, OpenFileResult } from '@shared/ipc'
import type { AutomatonDocument } from '@/model/graph'
import { describeError } from '@/core/automaton/errors'
import { deserializeDocument, serializeDocument } from '@/model/serialization'
import { askChoice, isModalOpen } from '@/store/dialogStore'
import { useEditorStore } from '@/store/editorStore'
import { useScreenStore } from '@/store/screenStore'
import { commitActiveInput } from '@/utils/dom'
import { openExportDialog } from './exportActions'
import { openHelp } from './helpActions'
import { createConfiguredDocument, openSettings } from './settingsActions'

/** `true` in Electron, `false` im reinen Browser (Vite-Dev-Server). */
export const isElectron = typeof window !== 'undefined' && window.api !== undefined

/** Anzeigename des Automaten: Dateiname ohne Ordner und Endung, sonst „Unbenannt“. */
export function displayName(filePath: string | null): string {
  const fileName = filePath?.split(/[\\/]/).pop()
  return fileName?.replace(/\.[^.]+$/, '') || 'Unbenannt'
}

/**
 * Fragt bei ungespeicherten Änderungen „Speichern / Nicht speichern / Abbrechen“.
 * Liefert, ob es weitergehen darf (gespeichert oder bewusst verworfen).
 */
export async function confirmDiscard(): Promise<boolean> {
  commitActiveInput()
  const { dirty, filePath } = useEditorStore.getState()
  if (!dirty) return true
  const choice = await askChoice({
    title: `Änderungen an „${displayName(filePath)}“ speichern?`,
    buttons: ['Speichern', 'Nicht speichern', 'Abbrechen'],
    danger: 1
  })
  if (choice === 1) return true
  if (choice !== 0) return false
  await saveFile()
  return !useEditorStore.getState().dirty
}

/** Antwort auf „Fenster schließen“ aus dem Hauptprozess. */
export async function closeWindow(): Promise<void> {
  if (await confirmDiscard()) window.api?.closeWindow()
}

function openFileInBrowser(): Promise<OpenFileResult | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.addEventListener('change', async () => {
      const file = input.files?.[0]
      resolve(file ? { filePath: file.name, content: await file.text() } : null)
    })
    input.addEventListener('cancel', () => resolve(null))
    input.click()
  })
}

function downloadInBrowser(content: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

export async function newFile(): Promise<void> {
  if (!(await confirmDiscard())) return
  useEditorStore.getState().loadDocument(createConfiguredDocument(), null)
}

export function openFile(): Promise<void> {
  return openFrom(() => (window.api ? window.api.openFile() : openFileInBrowser()))
}

/** Öffnet eine ins Fenster gezogene Datei – mit derselben Rückfrage wie „Öffnen“. */
export function openDroppedFile(file: File): Promise<void> {
  return openFrom(async () => ({
    // Im Browser gibt es keinen Pfad – der Dateiname reicht für den Anzeigenamen
    filePath: window.api ? window.api.pathForFile(file) : file.name,
    content: await file.text()
  }))
}

async function openFrom(read: () => Promise<OpenFileResult | null>): Promise<void> {
  if (!(await confirmDiscard())) return
  const store = useEditorStore.getState()
  // Das Lesen ist asynchron – wer währenddessen weiterarbeitet, soll nichts verlieren
  const { session, document: before } = store
  try {
    const result = await read()
    if (!result) return
    const document = deserializeDocument(result.content)
    const now = useEditorStore.getState()
    if (now.session !== session) return
    if (now.document !== before && !(await confirmDiscard())) return
    if (useEditorStore.getState().session !== session) return
    // Im Browser ist das nur der Dateiname (ohne Ordner) – reicht für den Anzeigenamen.
    // Ohne Pfad (Electron kennt ihn nicht) fragt „Speichern“ wie bei einem neuen Automaten.
    store.loadDocument(document, result.filePath || null)
    store.setStatus(null)
  } catch (err) {
    store.setStatus({ kind: 'error', text: `Öffnen fehlgeschlagen: ${describeError(err)}` })
  }
}

/** Speichervorgänge laufen nacheinander – ein älterer Abschluss überholt nie einen neueren. */
let saving: Promise<void> = Promise.resolve()

export function saveFile(saveAs = false): Promise<void> {
  commitActiveInput()
  // Gespeichert wird dieser Stand – Änderungen während des Schreibens bleiben ungespeichert
  const { document, session } = useEditorStore.getState()
  const job = saving.then(() => writeDocument(document, session, saveAs))
  saving = job
  return job
}

async function writeDocument(
  document: AutomatonDocument,
  session: number,
  saveAs: boolean
): Promise<void> {
  const store = useEditorStore.getState()
  // Inzwischen ein anderes Dokument geöffnet → dieser Stand ist nicht mehr zu speichern
  if (store.session !== session) return
  const content = serializeDocument(document)
  try {
    if (window.api) {
      const path = await window.api.saveFile(content, saveAs ? null : store.filePath)
      // Inzwischen ein anderes Dokument geöffnet → der Pfad gehört nicht mehr dazu
      if (!path || useEditorStore.getState().session !== session) return
      store.markSaved(path, document)
      store.setStatus(null)
    } else {
      downloadInBrowser(content, `${displayName(store.filePath)}.json`)
      store.markSaved(store.filePath, document)
    }
  } catch (err) {
    store.setStatus({ kind: 'error', text: `Speichern fehlgeschlagen: ${describeError(err)}` })
  }
}

export function runMenuAction(action: MenuAction): void {
  // Das native Menü bleibt bei offenen Fenstern klickbar – dahinter soll nichts passieren
  if (isModalOpen()) return
  const store = useEditorStore.getState()
  switch (action) {
    case 'new':
      void newFile()
      break
    case 'open':
      void openFile()
      break
    case 'save':
      void saveFile()
      break
    case 'saveAs':
      void saveFile(true)
      break
    case 'undo':
      store.undo()
      break
    case 'redo':
      store.redo()
      break
    case 'delete':
      // Wie das Tastenkürzel nur im Grapheneditor – andere Screens haben ihre eigene Auswahl
      if (useScreenStore.getState().screen === 'graph') store.deleteSelection()
      break
    case 'export':
      openExportDialog()
      break
    case 'settings':
      openSettings()
      break
    case 'help':
      openHelp()
      break
  }
}

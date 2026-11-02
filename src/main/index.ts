import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  shell,
  type MenuItemConstructorOptions
} from 'electron'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import iconIco from '../../build/icon.ico?asset'
import iconPng from '../../build/icon.png?asset'
import {
  IpcChannels,
  type FileFilter,
  type MenuAction,
  type OpenFileKind,
  type OpenFileResult
} from '../shared/ipc'
import { toAccelerator, type KeyAction } from '../shared/keybindings'
import {
  defaultSettings,
  normalizeSettings,
  serializeSettings,
  type Settings
} from '../shared/settings'
import { safeWriteFile } from './safeWrite'

// Stürzt der GPU-Prozess mehr als sechsmal ab (z. B. Treiber-Resets im Standby), beendet
// Chromium sonst die ganze App ohne Rückfrage. So startet er stattdessen einfach neu.
app.commandLine.appendSwitch('disable-gpu-process-crash-limit')

app.on('child-process-gone', (_event, details) => {
  if (details.reason !== 'clean-exit') console.warn('Kindprozess beendet:', details)
})
app.on('render-process-gone', (_event, _contents, details) => {
  console.warn('Renderer beendet:', details)
})

/** Fenster mit ungespeicherten Änderungen – beim Schließen fragt der Renderer nach. */
const dirtyWindows = new WeakSet<BrowserWindow>()

/** Aktuelle Einstellungen – das Menü zeigt daraus die Tastenkürzel. */
let settings: Settings = defaultSettings()

function settingsFile(): string {
  return join(app.getPath('appData'), 'maxbtw0', 'automat', 'settings.json')
}

async function readSettings(): Promise<Settings> {
  try {
    return normalizeSettings(JSON.parse(await readFile(settingsFile(), 'utf-8')))
  } catch {
    return defaultSettings()
  }
}

async function writeSettings(next: Settings): Promise<void> {
  const file = settingsFile()
  await mkdir(dirname(file), { recursive: true })
  await safeWriteFile(file, serializeSettings(next))
}

const FILE_FILTERS = [
  { name: 'Automat-Dateien', extensions: ['json'] },
  { name: 'Alle Dateien', extensions: ['*'] }
]

const OPEN_DIALOGS: Record<OpenFileKind, { title: string; filters: FileFilter[] }> = {
  automat: { title: 'Automat öffnen', filters: FILE_FILTERS },
  autoEdit: {
    title: 'Aus AutoEdit importieren',
    filters: [
      { name: 'AutoEdit-Dateien', extensions: ['xml'] },
      { name: 'Alle Dateien', extensions: ['*'] }
    ]
  }
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'Automat',
    // Windows wählt aus der ICO die passende Größe (Taskleiste 24/32 px) statt 512 px herunterzurechnen
    icon: process.platform === 'win32' ? iconIco : iconPng,
    backgroundColor: '#1f1e1d',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: false
    }
  })

  win.once('ready-to-show', () => win.show())
  // Links (z. B. GitHub in der Hilfe) öffnen im Standardbrowser statt in einem neuen Fenster
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.on('close', (event) => {
    if (!dirtyWindows.has(win)) return
    event.preventDefault()
    win.webContents.send(IpcChannels.closeRequest)
  })

  const devServerUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devServerUrl) {
    void win.loadURL(devServerUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

function sendMenuAction(action: MenuAction): void {
  BrowserWindow.getFocusedWindow()?.webContents.send(IpcChannels.menuAction, action)
}

/**
 * Menüpunkt mit dem Tastenkürzel aus den Einstellungen. Das Kürzel steht nur da – auslösen
 * tut es der Renderer, damit Eingabefelder z. B. ihr eigenes Strg+Z behalten.
 */
function actionItem(label: string, action: MenuAction, key: KeyAction): MenuItemConstructorOptions {
  const combo = settings.keybindings[key][0]
  const accelerator = combo ? toAccelerator(combo) : null
  return {
    label,
    click: () => sendMenuAction(action),
    ...(accelerator && { accelerator, registerAccelerator: false })
  }
}

function buildMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'Datei',
      submenu: [
        actionItem('Neu', 'new', 'file.new'),
        actionItem('Öffnen …', 'open', 'file.open'),
        { label: 'Aus AutoEdit importieren …', click: () => sendMenuAction('importAutoEdit') },
        { type: 'separator' },
        actionItem('Speichern', 'save', 'file.save'),
        actionItem('Speichern unter …', 'saveAs', 'file.saveAs'),
        actionItem('Exportieren …', 'export', 'file.export'),
        { type: 'separator' },
        { label: 'Beenden', role: 'quit' }
      ]
    },
    {
      label: 'Bearbeiten',
      submenu: [
        actionItem('Rückgängig', 'undo', 'edit.undo'),
        actionItem('Wiederholen', 'redo', 'edit.redo'),
        { type: 'separator' },
        actionItem('Auswahl löschen', 'delete', 'edit.delete'),
        { type: 'separator' },
        { label: 'Ausschneiden', role: 'cut' },
        { label: 'Kopieren', role: 'copy' },
        { label: 'Einfügen', role: 'paste' },
        { type: 'separator' },
        actionItem('Einstellungen …', 'settings', 'edit.settings')
      ]
    },
    // Neu laden und Entwicklertools nur beim Entwickeln – die fertige App braucht sie nicht.
    ...(app.isPackaged
      ? []
      : [
          {
            label: 'Ansicht',
            submenu: [
              { label: 'Neu laden', role: 'reload' },
              { label: 'Entwicklertools', role: 'toggleDevTools' },
              { type: 'separator' },
              { label: 'Vollbild', role: 'togglefullscreen' }
            ]
          } satisfies MenuItemConstructorOptions
        ]),
    // Ohne Untermenü: ein Klick auf „Hilfe“ öffnet sie direkt (F1 löst der Renderer aus).
    { label: 'Hilfe', click: () => sendMenuAction('help') }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

/** Zeigt einen Speichern-Dialog und liefert den gewählten Pfad oder `null` bei Abbruch. */
async function askSavePath(
  sender: Electron.WebContents,
  title: string,
  defaultPath = 'automat.json',
  filters: FileFilter[] = FILE_FILTERS
): Promise<string | null> {
  const win = BrowserWindow.fromWebContents(sender)
  const options: Electron.SaveDialogOptions = { title, defaultPath, filters }
  const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
  return result.canceled || !result.filePath ? null : result.filePath
}

/** Zuletzt begonnene Bildfolge pro Fenster (`webContents.id`) */
const sequences = new Map<
  number,
  { folder: string; baseName: string; extension: string; count: number }
>()

function registerIpcHandlers(): void {
  ipcMain.handle(
    IpcChannels.openFile,
    async (event, kind: OpenFileKind = 'automat'): Promise<OpenFileResult | null> => {
      const win = BrowserWindow.fromWebContents(event.sender)
      const options: Electron.OpenDialogOptions = {
        ...(OPEN_DIALOGS[kind] ?? OPEN_DIALOGS.automat),
        properties: ['openFile']
      }
      const result = win
        ? await dialog.showOpenDialog(win, options)
        : await dialog.showOpenDialog(options)
      if (result.canceled || result.filePaths.length === 0) return null

      const filePath = result.filePaths[0]
      return { filePath, data: await readFile(filePath) }
    }
  )

  ipcMain.handle(
    IpcChannels.saveFile,
    async (event, content: string, filePath: string | null): Promise<string | null> => {
      const target = filePath ?? (await askSavePath(event.sender, 'Automat speichern'))
      if (!target) return null
      await safeWriteFile(target, content)
      return target
    }
  )

  ipcMain.handle(
    IpcChannels.exportSave,
    async (event, defaultName: string, filter: FileFilter, data: Uint8Array) => {
      const target = await askSavePath(event.sender, 'Exportieren', defaultName, [filter])
      if (!target) return null
      await safeWriteFile(target, data)
      return target
    }
  )

  ipcMain.handle(
    IpcChannels.exportSequenceBegin,
    async (event, baseName: string, extension: string, count: number) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      const options: Electron.OpenDialogOptions = {
        title: 'Ordner für die Bildfolge wählen',
        properties: ['openDirectory', 'createDirectory']
      }
      const result = win
        ? await dialog.showOpenDialog(win, options)
        : await dialog.showOpenDialog(options)
      if (result.canceled || result.filePaths.length === 0) return null
      const folder = result.filePaths[0]
      if (!/^[a-z]+$/.test(extension)) throw new Error('Ungültige Endung')
      sequences.set(event.sender.id, { folder, baseName: basename(baseName), extension, count })
      return folder
    }
  )

  // Ein Bild nach dem anderen – der Renderer muss nie alle gleichzeitig im Speicher halten.
  // Den Pfad baut der Hauptprozess selbst: Der Renderer wählt nur die Nummer.
  ipcMain.handle(IpcChannels.exportSequenceWrite, async (event, index: number, data: Uint8Array) => {
    const sequence = sequences.get(event.sender.id)
    if (!sequence) throw new Error('Keine Bildfolge begonnen')
    const { folder, baseName, extension, count } = sequence
    if (!Number.isInteger(index) || index < 0 || index >= count) throw new Error('Ungültiges Bild')
    const number = String(index + 1).padStart(Math.max(2, String(count).length), '0')
    await safeWriteFile(join(folder, `${baseName}-${number}.${extension}`), data)
  })

  ipcMain.handle(IpcChannels.exportPdf, async (event, defaultName: string, html: string) => {
    const filter = { name: 'PDF', extensions: ['pdf'] }
    const target = await askSavePath(event.sender, 'Als PDF exportieren', defaultName, [filter])
    if (!target) return null
    // Unsichtbares Fenster nur zum Drucken – ohne JavaScript, der Inhalt ist reines HTML/SVG.
    const printer = new BrowserWindow({ show: false, webPreferences: { javascript: false } })
    // Über eine Datei statt data:-URL – Chromium lehnt URLs über 2 MB ab (lange Simulationen)
    const folder = await mkdtemp(join(app.getPath('temp'), 'automat-pdf-'))
    try {
      const page = join(folder, 'export.html')
      await writeFile(page, html, 'utf-8')
      await printer.loadFile(page)
      const pdf = await printer.webContents.printToPDF({
        // A4 hoch oder quer je Seite – das legt das HTML per @page fest
        preferCSSPageSize: true,
        printBackground: true,
        // Ränder macht das HTML selbst, damit dunkle Seiten randlos sind
        margins: { top: 0, bottom: 0, left: 0, right: 0 }
      })
      await safeWriteFile(target, pdf)
      return target
    } finally {
      printer.destroy()
      await rm(folder, { recursive: true, force: true })
    }
  })

  ipcMain.handle(IpcChannels.loadSettings, (): Settings => settings)

  ipcMain.handle(IpcChannels.saveSettings, async (_event, next: unknown) => {
    settings = normalizeSettings(next)
    buildMenu()
    await writeSettings(settings)
  })

  ipcMain.on(IpcChannels.windowDirty, (event, dirty: boolean) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    if (dirty) dirtyWindows.add(win)
    else dirtyWindows.delete(win)
  })

  ipcMain.on(IpcChannels.closeWindow, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    dirtyWindows.delete(win)
    win.close()
  })
}

void app.whenReady().then(async () => {
  settings = await readSettings()
  registerIpcHandlers()
  buildMenu()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

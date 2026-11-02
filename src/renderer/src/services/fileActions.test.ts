import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AutomatApi } from '@shared/ipc'
import { createEmptyDocument, type AutomatonDocument } from '@/model/graph'
import { deserializeDocument } from '@/model/serialization'
import { useDialogStore } from '@/store/dialogStore'
import { useEditorStore } from '@/store/editorStore'
import { useScreenStore } from '@/store/screenStore'
import { serializeDocument } from '@/model/serialization'
import {
  closeWindow,
  confirmDiscard,
  displayName,
  newFile,
  openDroppedFile,
  openFile,
  runMenuAction,
  saveFile
} from './fileActions'

describe('displayName', () => {
  it('nimmt den Dateinamen ohne Ordner und Endung', () => {
    expect(displayName('C:\\Users\\max\\Automaten\\gerade-as.json')).toBe('gerade-as')
    expect(displayName('/home/max/dea.automat.json')).toBe('dea.automat')
    expect(displayName('nur-name.json')).toBe('nur-name')
  })

  it('liefert „Unbenannt“ ohne Datei', () => {
    expect(displayName(null)).toBe('Unbenannt')
  })
})

describe('Rückfrage bei ungespeicherten Änderungen', () => {
  const store = () => useEditorStore.getState()
  const dialog = () => useDialogStore.getState()
  const api = {
    saveFile: vi.fn<AutomatApi['saveFile']>(),
    closeWindow: vi.fn<AutomatApi['closeWindow']>()
  }

  beforeEach(() => {
    vi.stubGlobal('window', { api })
    api.saveFile.mockReset().mockResolvedValue('/automaten/dea.json')
    api.closeWindow.mockReset()
    store().newDocument()
    store().addState(0, 0)
  })

  afterEach(() => vi.unstubAllGlobals())

  /** Wartet, bis der Dialog offen ist, und drückt Knopf `index`. */
  async function answer(index: number): Promise<void> {
    await vi.waitFor(() => expect(dialog().request).not.toBeNull())
    dialog().answer(index)
  }

  it('fragt nicht, wenn alles gespeichert ist', async () => {
    store().markSaved(null)
    expect(await confirmDiscard()).toBe(true)
    expect(dialog().request).toBeNull()
  })

  it('bietet Speichern, Nicht speichern und Abbrechen an', async () => {
    const done = confirmDiscard()
    expect(dialog().request?.title).toBe('Änderungen an „Unbenannt“ speichern?')
    expect(dialog().request?.buttons).toEqual(['Speichern', 'Nicht speichern', 'Abbrechen'])
    await answer(2)
    expect(await done).toBe(false)
  })

  it('„Speichern“ speichert und fährt fort', async () => {
    const done = confirmDiscard()
    await answer(0)
    expect(await done).toBe(true)
    expect(api.saveFile).toHaveBeenCalledOnce()
    expect(store().dirty).toBe(false)
  })

  it('abgebrochenes Speichern hält an', async () => {
    api.saveFile.mockResolvedValue(null)
    const done = confirmDiscard()
    await answer(0)
    expect(await done).toBe(false)
    expect(store().dirty).toBe(true)
  })

  it('„Neu“ mit „Nicht speichern“ verwirft den Automaten', async () => {
    const done = newFile()
    await answer(1)
    await done
    expect(store().document.graph.states).toHaveLength(0)
    expect(api.saveFile).not.toHaveBeenCalled()
  })

  it('„Neu“ mit „Abbrechen“ behält den Automaten', async () => {
    const done = newFile()
    await answer(2)
    await done
    expect(store().document.graph.states).toHaveLength(1)
  })

  it('Schließen geht erst nach der Antwort', async () => {
    const done = closeWindow()
    expect(api.closeWindow).not.toHaveBeenCalled()
    await answer(1)
    await done
    expect(api.closeWindow).toHaveBeenCalledOnce()
  })

  describe('angefangene Eingabe', () => {
    /** Ein Eingabefeld mit Fokus, das beim Fokusverlust den Zustand umbenennt (wie CommitInput) */
    function focusInputThatRenames(label: string): void {
      const id = store().document.graph.states[0].id
      class Input {
        blur(): void {
          store().updateState(id, { label })
        }
      }
      vi.stubGlobal('HTMLElement', Input)
      vi.stubGlobal('HTMLInputElement', Input)
      vi.stubGlobal('document', { activeElement: new Input() })
    }

    beforeEach(() => store().markSaved(null))

    it('„Neu“ übernimmt sie und fragt dann nach', async () => {
      focusInputThatRenames('neu')
      const done = newFile()
      await answer(2)
      await done
      expect(store().document.graph.states[0].label).toBe('neu')
    })

    it('Speichern schreibt sie mit', async () => {
      focusInputThatRenames('neu')
      await saveFile()
      const [content] = api.saveFile.mock.calls[0]
      expect(deserializeDocument(content).graph.states[0].label).toBe('neu')
      expect(store().dirty).toBe(false)
    })
  })

  it('Schließen mit „Abbrechen“ lässt das Fenster offen', async () => {
    const done = closeWindow()
    await answer(2)
    await done
    expect(api.closeWindow).not.toHaveBeenCalled()
  })
})

describe('Speichern während weiterer Änderungen', () => {
  const store = () => useEditorStore.getState()
  const waiting: ((path: string | null) => void)[] = []
  let saved = ''

  /** Beendet den ältesten laufenden Schreibauftrag, sobald er beim Hauptprozess ankommt. */
  async function finish(path: string | null): Promise<void> {
    await vi.waitFor(() => expect(waiting).not.toHaveLength(0))
    waiting.shift()?.(path)
  }

  beforeEach(() => {
    const saveFile: AutomatApi['saveFile'] = (content) => {
      saved = content
      return new Promise((resolve) => waiting.push(resolve))
    }
    vi.stubGlobal('window', { api: { saveFile } })
    store().newDocument()
    store().addState(0, 0)
  })

  afterEach(() => vi.unstubAllGlobals())

  it('Änderungen während des Schreibens bleiben ungespeichert', async () => {
    const pending = saveFile()
    store().addState(100, 0)
    await finish('/automaten/dea.json')
    await pending

    expect(deserializeDocument(saved).graph.states).toHaveLength(1)
    expect(store().filePath).toBe('/automaten/dea.json')
    expect(store().dirty).toBe(true)
    store().undo()
    expect(store().dirty).toBe(false)
  })

  it('ein inzwischen geöffnetes Dokument behält seinen Pfad', async () => {
    const pending = saveFile()
    await vi.waitFor(() => expect(waiting).toHaveLength(1))
    store().loadDocument(createEmptyDocument('NFA'), '/automaten/nea.json')
    await finish('/automaten/dea.json')
    await pending

    expect(store().filePath).toBe('/automaten/nea.json')
    expect(store().dirty).toBe(false)
  })

  it('ein älterer Abschluss überholt keinen neueren', async () => {
    const first = saveFile()
    store().addState(100, 0)
    const second = saveFile()
    await finish('/automaten/dea.json')
    await first
    expect(store().dirty).toBe(true)
    await finish('/automaten/dea.json')
    await second
    expect(deserializeDocument(saved).graph.states).toHaveLength(2)
    expect(store().dirty).toBe(false)
  })
})

describe('Speichern nach einem Fehler', () => {
  const store = () => useEditorStore.getState()
  const saveFileApi = vi.fn<AutomatApi['saveFile']>()

  beforeEach(() => {
    vi.stubGlobal('window', { api: { saveFile: saveFileApi } })
    saveFileApi.mockReset().mockResolvedValue('/automaten/dea.json')
  })

  afterEach(() => vi.unstubAllGlobals())

  it('meldet einen Serialisierungsfehler und speichert danach wieder', async () => {
    // Ein Kreis im Dokument lässt JSON.stringify scheitern
    const broken: Record<string, unknown> = { ...createEmptyDocument('DFA') }
    broken.self = broken
    store().loadDocument(broken as unknown as AutomatonDocument, null)
    store().addState(0, 0)

    await saveFile()
    expect(store().status?.kind).toBe('error')
    expect(store().dirty).toBe(true)
    expect(saveFileApi).not.toHaveBeenCalled()

    store().loadDocument(createEmptyDocument('NFA'), null)
    store().addState(0, 0)
    await saveFile()
    expect(saveFileApi).toHaveBeenCalledOnce()
    expect(store().dirty).toBe(false)
  })
})

describe('Öffnen während weiterer Änderungen', () => {
  const store = () => useEditorStore.getState()
  const dialog = () => useDialogStore.getState()
  let finish: ((content: string) => void) | null = null

  /** Wartet, bis der Datei-Dialog läuft, und liefert dann den Inhalt. */
  async function answerWith(content: string): Promise<void> {
    await vi.waitFor(() => expect(finish).not.toBeNull())
    finish?.(content)
  }

  beforeEach(() => {
    finish = null
    const openFile: AutomatApi['openFile'] = () =>
      new Promise(
        (resolve) =>
          (finish = (content) =>
            resolve({ filePath: '/nea.json', data: new TextEncoder().encode(content) }))
      )
    vi.stubGlobal('window', { api: { openFile } })
    store().newDocument()
  })

  afterEach(() => vi.unstubAllGlobals())

  const otherFile = () => serializeDocument(createEmptyDocument('NFA'))

  it('fragt erneut, wenn sich der Automat beim Lesen geändert hat', async () => {
    const pending = openFile()
    await vi.waitFor(() => expect(finish).not.toBeNull())
    store().addState(0, 0)
    await answerWith(otherFile())
    await vi.waitFor(() => expect(dialog().request).not.toBeNull())
    dialog().answer(2)
    await pending
    expect(store().document.graph.states).toHaveLength(1)
    expect(store().dirty).toBe(true)
  })

  it('verwirft die Datei, wenn inzwischen ein anderes Dokument offen ist', async () => {
    const pending = openFile()
    await vi.waitFor(() => expect(finish).not.toBeNull())
    store().loadDocument(createEmptyDocument('DFA'), '/dea.json')
    await answerWith(otherFile())
    await pending
    expect(store().filePath).toBe('/dea.json')
  })

  it('öffnet die Datei ohne Zwischenänderungen', async () => {
    const pending = openFile()
    await answerWith(otherFile())
    await pending
    expect(store().document.type).toBe('NFA')
    expect(store().filePath).toBe('/nea.json')
  })

  it('importiert eine AutoEdit-Datei ungespeichert und ohne Pfad', async () => {
    const pending = openFile('autoEdit')
    await answerWith(
      '<AUTOMATON><TYPE value="NEA"/><STATE name="q_0" finalstate="true"/></AUTOMATON>'
    )
    await pending
    expect(store().document.type).toBe('NFA')
    expect(store().document.graph.states[0].label).toBe('q0')
    expect(store().filePath).toBeNull()
    expect(store().dirty).toBe(true)
  })

  it('importiert eine als ISO-8859-1 kodierte AutoEdit-Datei mit „ä“', async () => {
    finish = null
    const xml =
      '<?xml version="1.0" encoding="ISO-8859-1"?><AUTOMATON><TYPE value="DEA"/>' +
      '<ALPHABET><ITEM value="ä"/></ALPHABET><STATE name="z" finalstate="true">' +
      '<TRANSITION target="z"><LABEL read="ä"/></TRANSITION></STATE>' +
      '<INITIALSTATE value="z"/></AUTOMATON>'
    const data = Uint8Array.from(xml, (c) => c.charCodeAt(0))
    const openLatin1: AutomatApi['openFile'] = () => Promise.resolve({ filePath: '/a.xml', data })
    vi.stubGlobal('window', { api: { openFile: openLatin1 } })
    await openFile('autoEdit')
    expect(store().document.alphabet).toEqual(['ä'])
    expect(store().document.graph.transitions[0].labels).toEqual([{ read: 'ä' }])
  })

  it('meldet einen gescheiterten Import', async () => {
    const pending = openFile('autoEdit')
    await answerWith('<AUTOMATON><TYPE value="MOORE"/></AUTOMATON>')
    await pending
    expect(store().status).toEqual({
      kind: 'error',
      text: 'Import fehlgeschlagen: AutoEdit-Typ „MOORE“ wird nicht unterstützt.'
    })
  })
})

describe('Öffnen im Browser', () => {
  const store = () => useEditorStore.getState()

  beforeEach(() => store().newDocument())
  afterEach(() => vi.unstubAllGlobals())

  it('meldet einen Lesefehler, statt hängen zu bleiben', async () => {
    const listeners = new Map<string, () => void>()
    const unreadable = {
      name: 'nea.json',
      arrayBuffer: () => Promise.reject(new DOMException('Kein Zugriff', 'NotReadableError'))
    } as File
    const input = {
      files: [unreadable],
      addEventListener: (type: string, listener: () => void) => listeners.set(type, listener),
      click: () => listeners.get('change')?.()
    }
    vi.stubGlobal('window', {})
    vi.stubGlobal('HTMLElement', class {})
    vi.stubGlobal('document', { createElement: () => input, activeElement: null })
    await openFile()
    expect(store().status).toEqual({
      kind: 'error',
      text: expect.stringContaining('Öffnen fehlgeschlagen')
    })
  })
})

describe('Datei ins Fenster ziehen', () => {
  const store = () => useEditorStore.getState()
  const dialog = () => useDialogStore.getState()
  const pathForFile = vi.fn<AutomatApi['pathForFile']>()
  const dropped = (name: string, content: string) =>
    ({
      name,
      arrayBuffer: () => Promise.resolve(new TextEncoder().encode(content).buffer)
    }) as File
  const nfa = () => serializeDocument(createEmptyDocument('NFA'))

  beforeEach(() => {
    pathForFile.mockReset().mockReturnValue('C:\Automaten\nea.json')
    vi.stubGlobal('window', { api: { pathForFile } })
    store().newDocument()
  })

  afterEach(() => vi.unstubAllGlobals())

  it('öffnet die Datei mit ihrem vollen Pfad', async () => {
    await openDroppedFile(dropped('nea.json', nfa()))
    expect(store().document.type).toBe('NFA')
    expect(store().filePath).toBe('C:\Automaten\nea.json')
    expect(store().dirty).toBe(false)
  })

  it('fragt vorher nach ungespeicherten Änderungen', async () => {
    store().addState(0, 0)
    const pending = openDroppedFile(dropped('nea.json', nfa()))
    expect(dialog().request?.buttons).toEqual(['Speichern', 'Nicht speichern', 'Abbrechen'])
    dialog().answer(2)
    await pending
    expect(store().document.graph.states).toHaveLength(1)
    expect(store().filePath).toBeNull()
  })

  it('„Nicht speichern“ öffnet die Datei', async () => {
    store().addState(0, 0)
    const pending = openDroppedFile(dropped('nea.json', nfa()))
    dialog().answer(1)
    await pending
    expect(store().document.type).toBe('NFA')
  })

  it('ohne Pfad gilt der Automat als neu', async () => {
    pathForFile.mockReturnValue('')
    await openDroppedFile(dropped('nea.json', nfa()))
    expect(store().document.type).toBe('NFA')
    expect(store().filePath).toBeNull()
  })

  it('meldet eine ungültige Datei und behält den Automaten', async () => {
    store().addState(0, 0)
    store().markSaved(null)
    await openDroppedFile(dropped('bild.png', 'kein json'))
    expect(store().document.graph.states).toHaveLength(1)
    expect(store().status?.kind).toBe('error')
  })
})

describe('Menüaktionen bei offenem Fenster', () => {
  const store = () => useEditorStore.getState()

  beforeEach(() => store().newDocument())
  afterEach(() => useDialogStore.setState({ exportOpen: false }))

  it('löschen nichts hinter dem Export-Fenster', () => {
    const id = store().addState(0, 0)
    store().select({ kind: 'state', id })
    useDialogStore.getState().setExportOpen(true)

    runMenuAction('delete')
    runMenuAction('undo')
    expect(store().document.graph.states).toHaveLength(1)
  })

  it('wirken ohne offenes Fenster wie gewohnt', () => {
    const id = store().addState(0, 0)
    store().select({ kind: 'state', id })
    runMenuAction('delete')
    expect(store().document.graph.states).toHaveLength(0)
  })

  it('„Auswahl löschen“ wirkt nur im Grapheneditor', () => {
    const id = store().addState(0, 0)
    store().select({ kind: 'state', id })
    useScreenStore.getState().setScreen('transitionTable')
    runMenuAction('delete')
    useScreenStore.getState().setScreen('graph')
    expect(store().document.graph.states).toHaveLength(1)
  })
})

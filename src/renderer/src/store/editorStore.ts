import { create } from 'zustand'
import {
  compareSymbols,
  createEmptyDocument,
  createId,
  nextFreeSymbol,
  createStateNode,
  nextStatePosition,
  addTransitionEntry,
  removeTransitionEntry,
  replaceTransitionEntry,
  stackSettings,
  tapeSettings,
  usesTape,
  STACK_CANDIDATES,
  labelKey,
  labelSymbols,
  type AlphabetKind,
  type StackSettings,
  type TapeSettings,
  type TransitionLabel,
  type TransitionEntry,
  type AutomatonDocument,
  type EditorGraph,
  type StateId,
  type StateNode,
  type TransitionEdge,
  type TransitionId
} from '@/model/graph'

export type { AlphabetKind } from '@/model/graph'
import { clamp, type Viewport } from '@/utils/geometry'
import { sameTuringCell, setTuringCell, turingCell, type TuringCell } from '@/model/turingTable'

export type Tool = 'select' | 'state' | 'transition' | 'delete'

export type Selection =
  | { kind: 'state'; id: StateId }
  | { kind: 'transition'; id: TransitionId }
  | null

/**
 * Element, das gerade direkt im Canvas bearbeitet wird (Umbenennen / Symbole).
 * `append`: Das Feld startet leer, die Eingabe kommt als neue Regeln dazu.
 */
export type InlineEdit =
  | { kind: 'state'; id: StateId }
  | { kind: 'transition'; id: TransitionId; append?: boolean }
  | null

/** Hervorhebung im Canvas, z. B. während der Simulation. */
export interface Highlight {
  activeStateIds: StateId[]
  usedTransitionIds: TransitionId[]
  /** Am Ende einer Simulation: färbt die aktiven Zustände grün bzw. rot */
  outcome?: 'accepted' | 'rejected'
  /**
   * Elemente, die schon im vorherigen Schritt aktiv waren – sie dimmen kurz ab, damit man
   * sieht, dass ein Schritt passiert ist. `token` ändert sich bei jedem Schritt.
   */
  pulse?: HighlightPulse
}

export interface HighlightPulse {
  stateIds: StateId[]
  transitionIds: TransitionId[]
  token: number
  durationMs: number
}

export interface StatusMessage {
  kind: 'info' | 'error'
  text: string
}

export const MIN_ZOOM = 0.2
export const MAX_ZOOM = 4
const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 1 }
const HISTORY_LIMIT = 100

interface EditorState {
  document: AutomatonDocument
  filePath: string | null
  /** Stand der Datei auf der Platte – Undo bis dorthin macht `dirty` wieder `false`. */
  savedDocument: AutomatonDocument
  dirty: boolean
  /** Wird bei jedem Neu/Öffnen erhöht – ein laufendes Speichern gehört dann nicht mehr dazu. */
  session: number
  /** Wird bei jeder inhaltlichen Änderung erhöht (nicht beim reinen Verschieben). */
  revision: number
  past: AutomatonDocument[]
  future: AutomatonDocument[]

  tool: Tool
  selection: Selection
  inlineEdit: InlineEdit
  viewport: Viewport
  highlight: Highlight | null
  status: StatusMessage | null

  // --- UI ---
  setTool(tool: Tool): void
  select(selection: Selection): void
  setInlineEdit(edit: InlineEdit): void
  setViewport(viewport: Viewport): void
  resetViewport(): void
  setHighlight(highlight: Highlight | null): void
  setStatus(status: StatusMessage | null): void

  // --- Dokument / Datei ---
  newDocument(): void
  loadDocument(document: AutomatonDocument, filePath: string | null): void
  /** `document` = der gespeicherte Stand (Standard: der aktuelle). */
  markSaved(filePath: string | null, document?: AutomatonDocument): void
  setDocumentMeta(patch: Partial<Pick<AutomatonDocument, 'type' | 'alphabet'>>): void
  /** Ersetzt das ganze Dokument als ein Undo-Schritt (z. B. Ergebnis einer Umwandlung). */
  applyDocument(document: AutomatonDocument): void

  // --- Alphabet (Σ, beim Kellerautomaten Stack-Γ, bei der Turingmaschine Band-Γ ⊇ Σ) ---

  addSymbol(kind?: AlphabetKind): string
  /** Benennt ein Symbol um – auch in allen Regeln (und beim Stack-Startsymbol) */
  renameSymbol(oldSymbol: string, newSymbol: string, kind?: AlphabetKind): void
  /** Löscht ein Symbol – Regeln, die es benutzen, verschwinden mit */
  deleteSymbol(index: number, kind?: AlphabetKind): void
  sortAlphabet(kind?: AlphabetKind): void
  /**
   * Ersetzt das Alphabet durch `symbols`. Symbole, die in Übergängen benutzt werden, bleiben
   * (hinten angehängt) erhalten, damit keine Übergänge kaputtgehen. Liefert diese Symbole.
   */
  applyAlphabetPreset(symbols: string[], kind?: AlphabetKind): string[]
  /** Kellerautomat: Stack-Startsymbol, Akzeptanz */
  setStackSettings(patch: Partial<Omit<StackSettings, 'alphabet'>>): void
  /** Turingmaschine: Blank */
  setTapeSettings(patch: Partial<Omit<TapeSettings, 'alphabet'>>): void

  // --- Verlauf ---
  undo(): void
  redo(): void
  /** Legt den aktuellen Stand im Verlauf ab (z. B. vor dem Verschieben per Drag). */
  snapshot(): void

  // --- Zustände ---
  addState(x: number, y: number): StateId
  /** Verschiebt ohne Verlaufseintrag – vorher `snapshot()` aufrufen. */
  moveStateLive(id: StateId, x: number, y: number): void
  updateState(id: StateId, patch: Partial<Omit<StateNode, 'id'>>): void
  setStartState(id: StateId): void
  toggleFinal(id: StateId): void
  deleteState(id: StateId): void

  // --- Übergänge ---
  /** Legt einen Übergang an oder liefert den bestehenden zwischen denselben Zuständen. */
  addTransition(from: StateId, to: StateId): TransitionId
  updateTransition(id: TransitionId, patch: Partial<Omit<TransitionEdge, 'id'>>): void
  /** Hängt Regeln an, die der Übergang noch nicht hat. */
  addTransitionLabels(id: TransitionId, labels: TransitionLabel[]): void
  deleteTransition(id: TransitionId): void

  // --- Übergangstabelle (eine Zeile = δ(from, symbol) = to) ---
  addTransitionEntry(entry: TransitionEntry): void
  replaceTransitionEntry(previous: TransitionEntry, next: TransitionEntry): void
  removeTransitionEntry(entry: TransitionEntry): void
  /**
   * Legt einen Zustand an und ändert die Tabelle im selben Undo-Schritt: `previous` wird durch
   * `next(neueId)` ersetzt – ohne `previous` wird `next(neueId)` nur hinzugefügt.
   * Ohne `label` bekommt der Zustand die nächste freie Bezeichnung.
   */
  addStateWithEntry(
    previous: TransitionEntry | null,
    next: (stateId: StateId) => TransitionEntry,
    label?: string
  ): StateId

  // --- Turingmaschine (Matrix: eine Zelle = δ(from, read) = (to, write, move)) ---
  /**
   * Setzt die Zelle δ(from, read) – `null` leert sie. Mit `newStateLabel` wird zuerst ein neuer
   * Zustand angelegt und als Folgezustand eingesetzt (`cell.to` wird dann ignoriert), alles in
   * einem Undo-Schritt. Leeres `newStateLabel` = nächste freie Bezeichnung.
   * Liefert den Folgezustand.
   */
  setTuringCell(
    from: StateId,
    read: string,
    cell: TuringCell | null,
    newStateLabel?: string
  ): StateId | null

  deleteSelection(): void
}

const withGraph = (doc: AutomatonDocument, patch: Partial<EditorGraph>): AutomatonDocument => ({
  ...doc,
  graph: { ...doc.graph, ...patch }
})

const sameSymbols = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((s, i) => s === b[i])

const alphabetOf = (doc: AutomatonDocument, kind: AlphabetKind): string[] =>
  kind === 'input'
    ? doc.alphabet
    : kind === 'tape'
      ? tapeSettings(doc).alphabet
      : stackSettings(doc).alphabet

const withAlphabet = (
  doc: AutomatonDocument,
  kind: AlphabetKind,
  alphabet: string[]
): AutomatonDocument => {
  if (kind === 'input') return { ...doc, alphabet }
  if (kind === 'tape') return { ...doc, tape: { ...tapeSettings(doc), alphabet } }
  return { ...doc, stack: { ...stackSettings(doc), alphabet } }
}

/** Turingmaschine: Σ ⊆ Γ – neue Eingabesymbole kommen auch ins Bandalphabet (vor das Blank). */
const withInputInTape = (doc: AutomatonDocument, symbols: string[]): AutomatonDocument => {
  if (!usesTape(doc.type)) return doc
  const tape = tapeSettings(doc)
  const missing = symbols.filter((s) => !tape.alphabet.includes(s))
  if (missing.length === 0) return doc
  const blankIndex = tape.alphabet.indexOf(tape.blank)
  const at = blankIndex === -1 ? tape.alphabet.length : blankIndex
  const alphabet = [...tape.alphabet.slice(0, at), ...missing, ...tape.alphabet.slice(at)]
  return { ...doc, tape: { ...tape, alphabet } }
}

/** Wendet `map` auf jede Regel an (`null` = Regel entfernen); unveränderte Übergänge bleiben. */
const mapLabels = (
  doc: AutomatonDocument,
  map: (label: TransitionLabel) => TransitionLabel | null
): AutomatonDocument =>
  withGraph(doc, {
    transitions: doc.graph.transitions.map((t) => {
      const labels = t.labels.map(map)
      const changed = labels.some((l, i) => l !== t.labels[i])
      return changed ? { ...t, labels: labels.filter((l) => l !== null) } : t
    })
  })

function validSelection(doc: AutomatonDocument, selection: Selection): Selection {
  if (!selection) return null
  const list = selection.kind === 'state' ? doc.graph.states : doc.graph.transitions
  return list.some((item) => item.id === selection.id) ? selection : null
}

export const useEditorStore = create<EditorState>()((set, get) => {
  /** Übernimmt eine Dokumentänderung inkl. Verlaufseintrag. */
  const commit = (recipe: (doc: AutomatonDocument) => AutomatonDocument): void => {
    const { document, past, revision, savedDocument } = get()
    const next = recipe(document)
    if (next === document) return
    set({
      document: next,
      past: [...past, document].slice(-HISTORY_LIMIT),
      future: [],
      dirty: next !== savedDocument,
      revision: revision + 1
    })
  }

  const replaceDocument = (document: AutomatonDocument, filePath: string | null): void =>
    set({
      document,
      filePath,
      savedDocument: document,
      dirty: false,
      session: get().session + 1,
      revision: get().revision + 1,
      past: [],
      future: [],
      selection: null,
      inlineEdit: null,
      highlight: null,
      viewport: DEFAULT_VIEWPORT
    })

  const initialDocument = createEmptyDocument()

  return {
    document: initialDocument,
    filePath: null,
    savedDocument: initialDocument,
    dirty: false,
    session: 0,
    revision: 0,
    past: [],
    future: [],
    tool: 'select',
    selection: null,
    inlineEdit: null,
    viewport: DEFAULT_VIEWPORT,
    highlight: null,
    status: null,

    setTool: (tool) => set({ tool }),
    select: (selection) => set({ selection }),
    setInlineEdit: (inlineEdit) => set({ inlineEdit }),
    setViewport: (viewport) =>
      set({ viewport: { ...viewport, zoom: clamp(viewport.zoom, MIN_ZOOM, MAX_ZOOM) } }),
    resetViewport: () => set({ viewport: DEFAULT_VIEWPORT }),
    setHighlight: (highlight) => set({ highlight }),
    setStatus: (status) => set({ status }),

    newDocument: () => replaceDocument(createEmptyDocument(), null),
    loadDocument: (document, filePath) => replaceDocument(document, filePath),
    markSaved: (filePath, document = get().document) =>
      set((s) => ({ filePath, savedDocument: document, dirty: s.document !== document })),
    setDocumentMeta: (patch) => commit((doc) => ({ ...doc, ...patch })),
    applyDocument: (document) => {
      commit(() => document)
      set((s) => ({
        selection: validSelection(s.document, s.selection),
        inlineEdit: null,
        highlight: null
      }))
    },

    addSymbol: (kind = 'input') => {
      const doc = get().document
      // Bei der Turingmaschine darf ein neues Σ-Symbol nicht schon (als Bandsymbol) in Γ sein
      const taken = kind === 'input' && usesTape(doc.type) ? tapeSettings(doc).alphabet : []
      const symbol =
        kind === 'input'
          ? nextFreeSymbol([...doc.alphabet, ...taken])
          : nextFreeSymbol(alphabetOf(doc, kind), STACK_CANDIDATES)
      commit((d) => {
        const next = withAlphabet(d, kind, [...alphabetOf(d, kind), symbol])
        return kind === 'input' ? withInputInTape(next, [symbol]) : next
      })
      return symbol
    },
    renameSymbol: (oldSymbol, newSymbol, kind = 'input') =>
      commit((doc) => {
        if (oldSymbol === newSymbol || newSymbol === '') return doc
        const rename = (s: string): string => (s === oldSymbol ? newSymbol : s)
        // Erst die Regeln, dann das Alphabet – sonst überschreibt der Spread es.
        if (kind === 'tape' || (kind === 'input' && usesTape(doc.type))) {
          // Turingmaschine: Σ ⊆ Γ – ein Σ-Symbol heißt auch auf dem Band neu
          const renamed = mapLabels(doc, (l) =>
            labelSymbols(l, 'tape').includes(oldSymbol)
              ? { ...l, read: rename(l.read), write: l.write && rename(l.write) }
              : l
          )
          const tape = tapeSettings(doc)
          return {
            ...renamed,
            alphabet: doc.alphabet.map(rename),
            tape: { alphabet: tape.alphabet.map(rename), blank: rename(tape.blank) }
          }
        }
        if (kind === 'input') {
          const renamed = mapLabels(doc, (l) =>
            l.read === oldSymbol ? { ...l, read: newSymbol } : l
          )
          return withAlphabet(renamed, kind, doc.alphabet.map(rename))
        }
        const renamed = mapLabels(doc, (l) =>
          labelSymbols(l, kind).includes(oldSymbol)
            ? { ...l, pop: l.pop && rename(l.pop), push: l.push?.map(rename) }
            : l
        )
        const stack = stackSettings(doc)
        return {
          ...renamed,
          stack: {
            ...stack,
            alphabet: stack.alphabet.map(rename),
            start: stack.start === null ? null : rename(stack.start)
          }
        }
      }),
    deleteSymbol: (index, kind = 'input') =>
      commit((doc) => {
        const alphabet = alphabetOf(doc, kind)
        const symbol = alphabet[index]
        if (symbol === undefined) return doc // ungültiger Index → nichts tun
        // Turingmaschine: das Symbol bleibt in Γ, die Regeln bleiben also gültig
        if (kind === 'input' && usesTape(doc.type)) {
          return withAlphabet(doc, kind, alphabet.filter((_, i) => i !== index))
        }
        const without = mapLabels(doc, (l) => (labelSymbols(l, kind).includes(symbol) ? null : l))
        const result = withAlphabet(without, kind, alphabet.filter((_, i) => i !== index))
        if (kind === 'stack' && result.stack?.start === symbol) {
          return { ...result, stack: { ...result.stack, start: null } }
        }
        return result
      }),
    sortAlphabet: (kind = 'input') =>
      commit((doc) => {
        const current = alphabetOf(doc, kind)
        const alphabet = [...current].sort(compareSymbols)
        // Schon sortiert → dasselbe Dokument zurückgeben, dann entsteht kein Undo-Schritt.
        return sameSymbols(alphabet, current) ? doc : withAlphabet(doc, kind, alphabet)
      }),
    applyAlphabetPreset: (preset, kind = 'input') => {
      const symbols = preset.filter((s) => s !== '')
      const { document } = get()
      const used = new Set(
        document.graph.transitions.flatMap((t) => t.labels.flatMap((l) => labelSymbols(l, kind)))
      )
      const kept = alphabetOf(document, kind).filter((s) => used.has(s) && !symbols.includes(s))
      commit((doc) => {
        // Das Bandalphabet behält immer Σ und das Blank, das Stackalphabet das Startsymbol
        const start = kind === 'stack' ? stackSettings(doc).start : null
        const alphabet =
          kind === 'tape'
            ? [...new Set([...doc.alphabet, ...symbols, ...kept, tapeSettings(doc).blank])]
            : [...new Set([...symbols, ...kept, ...(start === null ? [] : [start])])]
        if (sameSymbols(alphabet, alphabetOf(doc, kind))) return doc
        const next = withAlphabet(doc, kind, alphabet)
        return kind === 'input' ? withInputInTape(next, alphabet) : next
      })
      return kept
    },
    setStackSettings: (patch) =>
      commit((doc) => {
        const stack = stackSettings(doc)
        const changed = Object.entries(patch).some(
          ([key, value]) => stack[key as keyof StackSettings] !== value
        )
        return changed ? { ...doc, stack: { ...stack, ...patch } } : doc
      }),
    setTapeSettings: (patch) =>
      commit((doc) => {
        const tape = tapeSettings(doc)
        const changed = Object.entries(patch).some(
          ([key, value]) => tape[key as keyof TapeSettings] !== value
        )
        return changed ? { ...doc, tape: { ...tape, ...patch } } : doc
      }),

    undo: () => {
      const { past, future, document, revision, selection, savedDocument } = get()
      const previous = past.at(-1)
      if (!previous) return
      set({
        document: previous,
        past: past.slice(0, -1),
        future: [document, ...future],
        dirty: previous !== savedDocument,
        revision: revision + 1,
        selection: validSelection(previous, selection),
        inlineEdit: null
      })
    },
    redo: () => {
      const { past, future, document, revision, selection, savedDocument } = get()
      const next = future[0]
      if (!next) return
      set({
        document: next,
        past: [...past, document].slice(-HISTORY_LIMIT),
        future: future.slice(1),
        dirty: next !== savedDocument,
        revision: revision + 1,
        selection: validSelection(next, selection),
        inlineEdit: null
      })
    },
    snapshot: () =>
      set((s) => ({ past: [...s.past, s.document].slice(-HISTORY_LIMIT), future: [] })),

    addState: (x, y) => {
      const id = createId('s')
      commit((doc) =>
        withGraph(doc, { states: [...doc.graph.states, createStateNode(doc.graph, x, y, id)] })
      )
      return id
    },
    moveStateLive: (id, x, y) =>
      set((s) => ({
        document: withGraph(s.document, {
          states: s.document.graph.states.map((st) => (st.id === id ? { ...st, x, y } : st))
        }),
        dirty: true
      })),
    updateState: (id, patch) =>
      commit((doc) =>
        withGraph(doc, {
          states: doc.graph.states.map((s) => (s.id === id ? { ...s, ...patch } : s))
        })
      ),
    // Ein Startzustand pro Automat. Für Typen mit mehreren Startzuständen hier erweitern.
    setStartState: (id) =>
      commit((doc) =>
        withGraph(doc, {
          states: doc.graph.states.map((s) => ({ ...s, isStart: s.id === id }))
        })
      ),
    toggleFinal: (id) =>
      commit((doc) =>
        withGraph(doc, {
          states: doc.graph.states.map((s) => (s.id === id ? { ...s, isFinal: !s.isFinal } : s))
        })
      ),
    deleteState: (id) => {
      commit((doc) =>
        withGraph(doc, {
          states: doc.graph.states.filter((s) => s.id !== id),
          transitions: doc.graph.transitions.filter((t) => t.from !== id && t.to !== id)
        })
      )
      set((s) => ({ selection: validSelection(s.document, s.selection), inlineEdit: null }))
    },

    addTransition: (from, to) => {
      const existing = get().document.graph.transitions.find((t) => t.from === from && t.to === to)
      if (existing) return existing.id
      const id = createId('t')
      commit((doc) =>
        withGraph(doc, {
          transitions: [...doc.graph.transitions, { id, from, to, labels: [] }]
        })
      )
      return id
    },
    updateTransition: (id, patch) =>
      commit((doc) =>
        withGraph(doc, {
          transitions: doc.graph.transitions.map((t) => (t.id === id ? { ...t, ...patch } : t))
        })
      ),
    addTransitionLabels: (id, labels) =>
      commit((doc) => {
        const edge = doc.graph.transitions.find((t) => t.id === id)
        if (!edge) return doc
        const known = new Set(edge.labels.map(labelKey))
        const next = [...edge.labels]
        for (const label of labels) {
          if (known.has(labelKey(label))) continue
          known.add(labelKey(label))
          next.push(label)
        }
        if (next.length === edge.labels.length) return doc
        return withGraph(doc, {
          transitions: doc.graph.transitions.map((t) => (t === edge ? { ...t, labels: next } : t))
        })
      }),
    deleteTransition: (id) => {
      commit((doc) =>
        withGraph(doc, { transitions: doc.graph.transitions.filter((t) => t.id !== id) })
      )
      set((s) => ({ selection: validSelection(s.document, s.selection), inlineEdit: null }))
    },

    addTransitionEntry: (entry) =>
      commit((doc) => {
        const graph = addTransitionEntry(doc.graph, entry)
        return graph === doc.graph ? doc : { ...doc, graph }
      }),
    replaceTransitionEntry: (previous, next) => {
      commit((doc) => {
        const graph = replaceTransitionEntry(doc.graph, previous, next)
        return graph === doc.graph ? doc : { ...doc, graph }
      })
      set((s) => ({ selection: validSelection(s.document, s.selection) }))
    },
    removeTransitionEntry: (entry) => {
      commit((doc) => {
        const graph = removeTransitionEntry(doc.graph, entry)
        return graph === doc.graph ? doc : { ...doc, graph }
      })
      set((s) => ({ selection: validSelection(s.document, s.selection), inlineEdit: null }))
    },
    addStateWithEntry: (previous, next, label) => {
      const id = createId('s')
      commit((doc) => {
        const { x, y } = nextStatePosition(doc.graph)
        const state = createStateNode(doc.graph, x, y, id, label)
        const withState = { ...doc.graph, states: [...doc.graph.states, state] }
        const entry = next(id)
        const graph = previous
          ? replaceTransitionEntry(withState, previous, entry)
          : addTransitionEntry(withState, entry)
        return { ...doc, graph }
      })
      set((s) => ({ selection: validSelection(s.document, s.selection) }))
      return id
    },

    setTuringCell: (from, read, cell, newStateLabel) => {
      const id = newStateLabel === undefined ? null : createId('s')
      commit((doc) => {
        let graph = doc.graph
        if (id !== null) {
          const { x, y } = nextStatePosition(graph)
          const state = createStateNode(graph, x, y, id, newStateLabel || undefined)
          graph = { ...graph, states: [...graph.states, state] }
        }
        const next = cell && id !== null ? { ...cell, to: id } : cell
        if (id === null && sameTuringCell(turingCell(graph, from, read), next)) return doc
        return { ...doc, graph: setTuringCell(graph, from, read, next) }
      })
      set((s) => ({ selection: validSelection(s.document, s.selection), inlineEdit: null }))
      return id ?? cell?.to ?? null
    },

    deleteSelection: () => {
      const { selection, deleteState, deleteTransition } = get()
      if (selection?.kind === 'state') deleteState(selection.id)
      else if (selection?.kind === 'transition') deleteTransition(selection.id)
    }
  }
})
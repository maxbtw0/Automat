import { useMemo, useState } from 'react'
import { ComboInput } from '@/components/common/ComboInput'
import { TuringTable } from '@/components/table/TuringTable'
import { ToolPalette } from '@/components/toolbar/ToolPalette'
import { formatStackWord, parseStackWord, pushSuggestions } from '@/core/automaton/labels'
import { getAutomatonDefinition } from '@/core/automaton/registry'
import { TRANSITION_TABLE_TOOLS, type TransitionTableTool } from '@/editor/transitionTableTools'
import {
  EPSILON,
  STACK_BOTTOM,
  entryKey,
  normalizeSymbol,
  listTransitionEntries,
  sortTransitionEntries,
  usesStack,
  usesTape,
  type EditorGraph,
  type TransitionEntry
} from '@/model/graph'
import { useEditorStore } from '@/store/editorStore'
import { useScreenStore } from '@/store/screenStore'
import { classNames } from '@/utils/dom'

/** Tabellenzeilen – sortiert oder in Dokument-Reihenfolge. */
function tableEntries(graph: EditorGraph, sorted: boolean): TransitionEntry[] {
  const entries = listTransitionEntries(graph)
  return sorted ? sortTransitionEntries(graph, entries) : entries
}

/** Turingmaschine: Matrix Zustand × Bandsymbol – sonst eine Zeile pro Regel. */
export function TransitionTableScreen() {
  const hasTape = useEditorStore((s) => usesTape(s.document.type))
  return hasTape ? <TuringTable /> : <TransitionList />
}

function TransitionList() {
  const graph = useEditorStore((s) => s.document.graph)
  const alphabet = useEditorStore((s) => s.document.alphabet)
  const type = useEditorStore((s) => s.document.type)
  const stackAlphabet = useEditorStore((s) => s.document.stack?.alphabet)
  /** Kellerautomat: zusätzliche Spalten Stacksymbol (pop) und Push */
  const hasStack = usesStack(type)
  const gamma = hasStack ? (stackAlphabet ?? []) : []
  const allowsEpsilon = getAutomatonDefinition(type).epsilon
  const symbolOptions = allowsEpsilon ? [...alphabet, EPSILON] : alphabet
  const sorted = useScreenStore((s) => s.transitionTableSorted)
  const { addTransitionEntry, replaceTransitionEntry, removeTransitionEntry, addStateWithEntry } =
    useEditorStore.getState()

  /** Ausgewählte Zeile (über entryKey) – darauf wirkt „Löschen“, „Neu“ startet bei ihrem Zustand. */
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const entries = useMemo(() => tableEntries(graph, sorted), [graph, sorted])
  const selected = entries.find((e) => entryKey(e) === selectedKey)

  /**
   * Neue Zeile für (Zustand, Symbol[, Stacksymbol]) – beim Kellerautomaten bleibt der Stack
   * unverändert (Push = Stacksymbol).
   */
  const newEntry = (from: string, symbol: string, pop?: string): TransitionEntry =>
    pop === undefined
      ? { from, symbol, to: from }
      : { from, symbol, to: from, pop, push: [pop] }

  /** Erste Kombination ohne Zeile – ab dem Zustand der ausgewählten Zeile. Ziel: Schleife. */
  const findFreeEntry = (): TransitionEntry | null => {
    const start = Math.max(0, graph.states.findIndex((s) => s.id === selected?.from))
    const states = [...graph.states.slice(start), ...graph.states.slice(0, start)]
    const pops: (string | undefined)[] = hasStack ? gamma : [undefined]
    for (const state of states) {
      for (const symbol of alphabet) {
        for (const pop of pops) {
          const exists = entries.some(
            (e) => e.from === state.id && e.symbol === symbol && e.pop === pop
          )
          if (!exists) return newEntry(state.id, symbol, pop)
        }
      }
    }
    return null
  }

  const handleAdd = (): void => {
    if (alphabet.length === 0) return setError('Erst ein Alphabet anlegen.')
    if (hasStack && gamma.length === 0) return setError('Erst ein Stackalphabet anlegen.')
    const entry = findFreeEntry()
    if (entry) {
      addTransitionEntry(entry)
      setSelectedKey(entryKey(entry))
      return
    }
    // Keine Zustände oder alle Kombinationen belegt → neuen Zustand mit Schleife anlegen.
    const symbol = alphabet[0]
    const pop = hasStack ? gamma[0] : undefined
    const id = addStateWithEntry(null, (newId) => newEntry(newId, symbol, pop))
    setSelectedKey(entryKey(newEntry(id, symbol, pop)))
  }

  const handleDelete = (): void => {
    if (!selected) return setError('Erst eine Zeile in der Tabelle auswählen.')
    const index = entries.indexOf(selected)
    removeTransitionEntry(selected)
    // Auswahl auf den Nachbarn setzen, damit man mehrfach hintereinander löschen kann.
    const rest = tableEntries(useEditorStore.getState().document.graph, sorted)
    const neighbour = rest[Math.min(index, rest.length - 1)]
    setSelectedKey(neighbour ? entryKey(neighbour) : null)
  }

  const handleTool = (tool: TransitionTableTool): void => {
    setError(null)
    switch (tool) {
      case 'add':
        handleAdd()
        break
      case 'delete':
        handleDelete()
        break
      case 'sort':
        useScreenStore.getState().setTransitionTableSorted(!sorted)
        break
    }
  }

  const handleChange = (entry: TransitionEntry, patch: Partial<TransitionEntry>): void => {
    setError(null)
    const next = { ...entry, ...patch }
    replaceTransitionEntry(entry, next)
    setSelectedKey(entryKey(next))
  }

  /** Getippter Zustandsname: vorhandenen Zustand nehmen, sonst einen mit diesem Namen anlegen. */
  const handleStateCommit = (entry: TransitionEntry, field: 'from' | 'to', input: string): boolean => {
    const label = input.trim()
    if (!label) return false
    const existing = graph.states.find((s) => s.label === label)
    if (existing) {
      handleChange(entry, { [field]: existing.id })
      return true
    }
    setError(null)
    const id = addStateWithEntry(entry, (newId) => ({ ...entry, [field]: newId }), label)
    setSelectedKey(entryKey({ ...entry, [field]: id }))
    return true
  }

  /** Getipptes Symbol muss in Σ sein – sonst Fehlermeldung und Feld zurücksetzen. */
  const handleSymbolCommit = (entry: TransitionEntry, input: string): boolean => {
    const symbol = normalizeSymbol(input)
    if (!symbol) return false
    if (symbol === EPSILON && !allowsEpsilon) {
      setError('ε gibt es nur beim NEA')
      return false
    }
    if (symbol !== EPSILON && !alphabet.includes(symbol)) {
      setError(`„${symbol}“ nicht im Alphabet`)
      return false
    }
    // Übergang ohne Regel bekommt beim Kellerautomaten eine Regel, die den Stack nicht ändert
    const needsStack = hasStack && entry.pop === undefined
    const pop = gamma[0] ?? STACK_BOTTOM
    handleChange(entry, needsStack ? { symbol, pop, push: [pop] } : { symbol })
    return true
  }

  /** Stacksymbol, das entfernt wird: ε oder aus Γ (leer = ε) */
  const handlePopCommit = (entry: TransitionEntry, input: string): boolean => {
    const pop = normalizeSymbol(input) || EPSILON
    if (pop === EPSILON) {
      setError('Top of Stack darf nicht ε sein')
      return false
    }
    if (!gamma.includes(pop)) {
      setError(`„${pop}“ nicht im Stackalphabet`)
      return false
    }
    handleChange(entry, { pop })
    return true
  }

  /** Stackwort, das abgelegt wird: Symbole aus Γ, leer = ε */
  const handlePushCommit = (entry: TransitionEntry, input: string): boolean => {
    const push = parseStackWord(input, gamma)
    const unknown = push.find((s) => !gamma.includes(s))
    if (unknown !== undefined) {
      setError(`„${unknown}“ nicht im Stackalphabet`)
      return false
    }
    handleChange(entry, { push })
    return true
  }

  /** Neuer Zustand mit der nächsten freien Bezeichnung, direkt in die Zeile eingesetzt */
  const handleNewState = (entry: TransitionEntry, field: 'from' | 'to'): void => {
    setError(null)
    const id = addStateWithEntry(entry, (newId) => ({ ...entry, [field]: newId }))
    setSelectedKey(entryKey({ ...entry, [field]: id }))
  }

  const labelOf = (id: string): string => graph.states.find((s) => s.id === id)?.label ?? '?'
  const stateLabels = graph.states.map((s) => s.label)

  const stateInput = (entry: TransitionEntry, field: 'from' | 'to', label: string) => (
    <ComboInput
      className="is-mono"
      aria-label={label}
      value={labelOf(entry[field])}
      options={stateLabels}
      actions={[{ label: '+ neuer Zustand', onSelect: () => handleNewState(entry, field) }]}
      onFocus={(e) => {
        setSelectedKey(entryKey(entry))
        e.currentTarget.select()
      }}
      onCommit={(value) => handleStateCommit(entry, field, value)}
    />
  )

  const symbolInput = (entry: TransitionEntry) => (
    <ComboInput
      className="is-mono"
      aria-label="Symbol"
      value={entry.symbol ?? ''}
      options={symbolOptions}
      placeholder="–"
      onFocus={(e) => {
        setSelectedKey(entryKey(entry))
        e.currentTarget.select()
      }}
      onCommit={(value) => handleSymbolCommit(entry, value)}
    />
  )

  const focusRow = (entry: TransitionEntry) => (e: { currentTarget: HTMLInputElement }) => {
    setSelectedKey(entryKey(entry))
    e.currentTarget.select()
  }

  const popInput = (entry: TransitionEntry) => (
    <ComboInput
      className="is-mono"
      aria-label="Top of Stack"
      value={entry.pop ?? ''}
      options={gamma}
      onFocus={focusRow(entry)}
      onCommit={(value) => handlePopCommit(entry, value)}
    />
  )

  const pushInput = (entry: TransitionEntry) => (
    <ComboInput
      className="is-mono"
      aria-label="Push"
      value={formatStackWord(entry.push ?? [], gamma)}
      options={pushSuggestions(entry.pop ?? STACK_BOTTOM, gamma)}
      onFocus={focusRow(entry)}
      onCommit={(value) => handlePushCommit(entry, value)}
    />
  )

  const columns = hasStack ? 6 : 4

  return (
    <div className="table-screen">
      <nav className="area-tools">
        <ToolPalette
          tools={TRANSITION_TABLE_TOOLS}
          active={sorted ? 'sort' : null}
          onSelect={handleTool}
        />
      </nav>
      <div className="table-screen-content">
        <h1>Übergangstabelle</h1>
        <table className="data-table is-wide">
          <thead>
            <tr>
              <th className="is-index">#</th>
              <th>Zustand</th>
              <th>{hasStack ? 'Eingabe' : 'Symbol'}</th>
              {hasStack && <th>Top of Stack</th>}
              {hasStack && <th>Push</th>}
              <th>Folgezustand</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr>
                <td colSpan={columns} className="muted">
                  noch keine Übergänge
                </td>
              </tr>
            )}
            {entries.map((entry, index) => {
              const key = entryKey(entry)
              return (
                <tr
                  // Position statt entryKey: Ändert man eine Zelle und springt per Tab weiter,
                  // bleibt die Zeile bestehen und das nächste Feld behält den Fokus.
                  key={index}
                  className={classNames(key === selectedKey && 'is-selected')}
                  onClick={() => setSelectedKey(key)}
                >
                  <td className="is-index">{index + 1}</td>
                  <td>{stateInput(entry, 'from', 'Zustand')}</td>
                  <td>{symbolInput(entry)}</td>
                  {hasStack && <td>{entry.symbol === null ? null : popInput(entry)}</td>}
                  {hasStack && <td>{entry.symbol === null ? null : pushInput(entry)}</td>}
                  <td>{stateInput(entry, 'to', 'Folgezustand')}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {error && <p className="table-error">{error}</p>}

      </div>
    </div>
  )
}

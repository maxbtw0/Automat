import { useMemo, useRef, useState } from 'react'
import { CommitInput } from '@/components/common/CommitInput'
import { ToolPalette } from '@/components/toolbar/ToolPalette'
import { STATE_TABLE_TOOLS, type StateTableTool } from '@/editor/stateTableTools'
import { nextStatePosition, tapeSettings, type StateId } from '@/model/graph'
import { turingCell, turingCells, type TuringCell } from '@/model/turingTable'
import { useSelectAllTarget } from '@/services/selectAll'
import { deleteStatesAsking } from '@/services/stateActions'
import { useEditorStore } from '@/store/editorStore'
import { classNames } from '@/utils/dom'
import { TuringCellDialog } from './TuringCellDialog'

/** Zelle als Text wie im Lehrbuch: „q1, X, R“ */
const formatCell = (cell: TuringCell, labelOf: (id: StateId) => string): string =>
  `${labelOf(cell.to)}, ${cell.write}, ${cell.move}`

/**
 * Übergangstabelle der Turingmaschine als Matrix: eine Zeile pro Zustand, eine Spalte pro
 * Bandsymbol (Blank zuletzt), Zelle δ(q, a) = (p, b, R). Klick auf eine Zelle öffnet ein kleines
 * Fenster zum Auswählen; leere Zelle = die Maschine hält dort.
 */
export function TuringTable() {
  const doc = useEditorStore((s) => s.document)
  const { graph } = doc
  const tape = tapeSettings(doc)
  const symbols = [...tape.alphabet.filter((s) => s !== tape.blank), tape.blank]
  const store = useEditorStore.getState()

  /** Ausgewählte Zustände – darauf wirkt „Löschen“ */
  const [selectedIds, setSelectedIds] = useState<StateId[]>([])
  const setSelectedId = (id: StateId | null): void => setSelectedIds(id === null ? [] : [id])
  /** Gerade angelegter Zustand – sein Namensfeld bekommt den Fokus */
  const [justAdded, setJustAdded] = useState<StateId | null>(null)
  const areaRef = useRef<HTMLDivElement>(null)
  useSelectAllTarget(areaRef, {
    selectAll: () => setSelectedIds(graph.states.map((s) => s.id)),
    clear: () => setSelectedIds([])
  })
  /** Zelle im Fenster */
  const [editing, setEditing] = useState<{ from: StateId; read: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const labels = useMemo(() => new Map(graph.states.map((s) => [s.id, s.label])), [graph.states])
  const labelOf = (id: StateId): string => labels.get(id) ?? '?'
  const cells = useMemo(() => turingCells(graph), [graph])

  const handleAdd = (): void => {
    const { x, y } = nextStatePosition(graph)
    const id = store.addState(x, y)
    setSelectedId(id)
    setJustAdded(id)
  }

  const handleDelete = async (): Promise<void> => {
    const index = graph.states.findIndex((s) => selectedIds.includes(s.id))
    if (index === -1) return setError('Erst einen Zustand in der Tabelle auswählen.')
    if (!(await deleteStatesAsking(selectedIds))) return
    // Auswahl auf den Nachbarn setzen, damit man mehrfach hintereinander löschen kann.
    const rest = useEditorStore.getState().document.graph.states
    setSelectedId(rest[Math.min(index, rest.length - 1)]?.id ?? null)
  }

  const handleTool = (tool: StateTableTool): void => {
    setError(null)
    if (tool === 'add') handleAdd()
    else void handleDelete()
  }

  const handleRename = (id: StateId, input: string): boolean => {
    const label = input.trim()
    if (!label) return false
    if (graph.states.some((s) => s.id !== id && s.label === label)) {
      setError(`„${label}“ doppelt`)
      return false
    }
    setError(null)
    store.updateState(id, { label })
    return true
  }

  const closeDialog = (): void => setEditing(null)

  return (
    <div className="table-screen" ref={areaRef}>
      <nav className="area-tools">
        <ToolPalette tools={STATE_TABLE_TOOLS} active={null} onSelect={handleTool} />
      </nav>
      <div className="table-screen-content">
        <h1>Übergangstabelle</h1>
        <table className="data-table turing-table">
          <thead>
            <tr>
              <th className="is-index">#</th>
              <th>Zustand</th>
              <th className="is-check">Start</th>
              <th className="is-check">Ende</th>
              {symbols.map((symbol) => (
                <th key={symbol} className="turing-symbol is-mono">
                  {symbol}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {graph.states.length === 0 && (
              <tr>
                <td colSpan={4 + symbols.length} className="muted">
                  noch keine Zustände
                </td>
              </tr>
            )}
            {graph.states.map((state, index) => (
              <tr
                key={state.id}
                className={classNames(selectedIds.includes(state.id) && 'is-selected')}
                onClick={() => setSelectedId(state.id)}
              >
                <td className="is-index">{index + 1}</td>
                <td className="turing-state">
                  <CommitInput
                    className="is-mono"
                    value={state.label}
                    aria-label={`Zustand ${index + 1}`}
                    autoFocus={state.id === justAdded}
                    onFocus={(e) => {
                      setSelectedId(state.id)
                      e.currentTarget.select()
                    }}
                    onCommit={(value) => handleRename(state.id, value)}
                  />
                </td>
                <td className="is-check">
                  <input
                    type="radio"
                    name="turing-start"
                    aria-label={`Startzustand ${state.label}`}
                    checked={state.isStart}
                    onChange={() => store.setStartState(state.id)}
                  />
                </td>
                <td className="is-check">
                  <input
                    type="checkbox"
                    aria-label={`Endzustand ${state.label}`}
                    checked={state.isFinal}
                    onChange={() => store.toggleFinal(state.id)}
                  />
                </td>
                {symbols.map((symbol) => {
                  const cell = cells.get(state.id)?.get(symbol) ?? null
                  return (
                    <td key={symbol} className="turing-cell-td">
                      <button
                        className={classNames('turing-cell', !cell && 'is-empty')}
                        aria-label={`δ(${state.label}, ${symbol})`}
                        onClick={() => {
                          setError(null)
                          setSelectedId(state.id)
                          setEditing({ from: state.id, read: symbol })
                        }}
                      >
                        {cell ? formatCell(cell, labelOf) : '–'}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {error && <p className="table-error">{error}</p>}
      </div>
      {editing && (
        <TuringCellDialog
          graph={graph}
          from={editing.from}
          read={editing.read}
          tapeAlphabet={symbols}
          blank={tape.blank}
          cell={turingCell(graph, editing.from, editing.read)}
          onApply={(cell, newStateLabel) => {
            store.setTuringCell(editing.from, editing.read, cell, newStateLabel)
            closeDialog()
          }}
          onRemove={() => {
            store.setTuringCell(editing.from, editing.read, null)
            closeDialog()
          }}
          onClose={closeDialog}
        />
      )}
    </div>
  )
}

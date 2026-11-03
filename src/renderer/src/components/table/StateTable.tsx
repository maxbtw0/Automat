import { useRef, useState } from 'react'
import { CommitInput } from '@/components/common/CommitInput'
import { ToolPalette } from '@/components/toolbar/ToolPalette'
import { formatWord, parseWord } from '@/core/automaton/labels'
import { STATE_TABLE_TOOLS, type StateTableTool } from '@/editor/stateTableTools'
import {
  nextStatePosition,
  outputSettings,
  outputsOnStates,
  stateOutput,
  usesOutput,
  type StateId
} from '@/model/graph'
import { useSelectAllTarget } from '@/services/selectAll'
import { deleteStatesAsking, toggleFinalState } from '@/services/stateActions'
import { useEditorStore } from '@/store/editorStore'
import { classNames } from '@/utils/dom'

interface StateTableProps {
  /** Fehlermeldung unter den Tabellen – `null` löscht sie */
  onError: (message: string | null) => void
}

/**
 * Zustände neben der Übergangstabelle: Name, Start- und Endzustand (Transduktoren ohne
 * Endzustand), Moore mit Ausgabe λ(z). Eigene Werkzeugleiste wie im Alphabet-Screen.
 */
export function StateTable({ onError }: StateTableProps) {
  const doc = useEditorStore((s) => s.document)
  const { graph } = doc
  const hasFinal = !usesOutput(doc.type)
  const moore = outputsOnStates(doc.type)
  const delta = outputSettings(doc).alphabet
  const store = useEditorStore.getState()

  /** Ausgewählte Zustände – darauf wirkt „Löschen“ */
  const [selectedIds, setSelectedIds] = useState<StateId[]>([])
  const setSelectedId = (id: StateId | null): void => setSelectedIds(id === null ? [] : [id])
  /** Gerade angelegter Zustand – sein Namensfeld bekommt den Fokus */
  const [justAdded, setJustAdded] = useState<StateId | null>(null)
  const areaRef = useRef<HTMLElement>(null)
  useSelectAllTarget(areaRef, {
    selectAll: () => setSelectedIds(graph.states.map((s) => s.id)),
    clear: () => setSelectedIds([])
  })

  const handleAdd = (): void => {
    const { x, y } = nextStatePosition(graph)
    const id = store.addState(x, y)
    setSelectedId(id)
    setJustAdded(id)
  }

  const handleDelete = async (): Promise<void> => {
    const index = graph.states.findIndex((s) => selectedIds.includes(s.id))
    if (index === -1) return onError('Erst einen Zustand in der Tabelle auswählen.')
    if (!(await deleteStatesAsking(selectedIds))) return
    // Auswahl auf den Nachbarn setzen, damit man mehrfach hintereinander löschen kann.
    const rest = useEditorStore.getState().document.graph.states
    setSelectedId(rest[Math.min(index, rest.length - 1)]?.id ?? null)
  }

  const handleTool = (tool: StateTableTool): void => {
    onError(null)
    if (tool === 'add') handleAdd()
    else void handleDelete()
  }

  const handleRename = (id: StateId, input: string): boolean => {
    const label = input.trim()
    if (!label) return false
    if (graph.states.some((s) => s.id !== id && s.label === label)) {
      onError(`„${label}“ doppelt`)
      return false
    }
    onError(null)
    store.updateState(id, { label })
    return true
  }

  /** Moore: Ausgabewort λ(z) aus Δ*, leer = ε */
  const handleOutput = (id: StateId, input: string): boolean => {
    const output = parseWord(input, delta)
    const unknown = output.find((s) => !delta.includes(s))
    if (unknown !== undefined) {
      onError(`„${unknown}“ nicht im Ausgabealphabet`)
      return false
    }
    onError(null)
    store.updateState(id, { output })
    return true
  }

  const columns = 3 + (moore ? 1 : 0) + (hasFinal ? 1 : 0)

  return (
    <section className="split-section" ref={areaRef}>
      <h1>Zustände</h1>
      <div className="split-body">
        <nav className="split-tools" aria-label="Werkzeuge Zustände">
          <ToolPalette tools={STATE_TABLE_TOOLS} active={null} onSelect={handleTool} />
        </nav>
        <div className="split-table">
          <table className="data-table">
            <thead>
              <tr>
                <th className="is-index">#</th>
                <th>Zustand</th>
                {moore && <th>Ausgabe</th>}
                <th className="is-check">Start</th>
                {hasFinal && <th className="is-check">Ende</th>}
              </tr>
            </thead>
            <tbody>
              {graph.states.length === 0 && (
                <tr>
                  <td colSpan={columns} className="muted">
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
                  <td>
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
                  {moore && (
                    <td>
                      <CommitInput
                        className="is-mono"
                        value={formatWord(stateOutput(state), delta)}
                        aria-label={`Ausgabe ${state.label}`}
                        onFocus={(e) => {
                          setSelectedId(state.id)
                          e.currentTarget.select()
                        }}
                        onCommit={(value) => handleOutput(state.id, value)}
                      />
                    </td>
                  )}
                  <td className="is-check">
                    <input
                      type="radio"
                      name="state-start"
                      aria-label={`Startzustand ${state.label}`}
                      checked={state.isStart}
                      onChange={() => store.setStartState(state.id)}
                    />
                  </td>
                  {hasFinal && (
                    <td className="is-check">
                      <input
                        type="checkbox"
                        aria-label={`Endzustand ${state.label}`}
                        checked={state.isFinal}
                        onChange={() => void toggleFinalState(state.id)}
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

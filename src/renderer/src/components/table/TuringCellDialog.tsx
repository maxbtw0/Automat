import { useEffect, useState } from 'react'
import { ComboInput } from '@/components/common/ComboInput'
import {
  TAPE_MOVES,
  documentDefaults,
  nextStateLabel,
  normalizeTapeSymbol,
  type EditorGraph,
  type StateId,
  type TapeMove
} from '@/model/graph'
import type { TuringCell } from '@/model/turingTable'
import { useDialogStore } from '@/store/dialogStore'
import { classNames, inertOutside, isEditableTarget } from '@/utils/dom'

const MOVE_TITLES: Record<TapeMove, string> = {
  L: 'Links (L)',
  N: 'Stehen bleiben (N)',
  R: 'Rechts (R)'
}

/** Bis zu so vielen Möglichkeiten Knöpfe – darüber ein Eingabefeld mit Vorschlagsliste */
const MAX_BUTTONS = 5

/** Auswahl „neuer Zustand“ statt eines vorhandenen */
const NEW_STATE = ''

interface TuringCellDialogProps {
  graph: EditorGraph
  from: StateId
  read: string
  /** Bandalphabet Γ – Auswahl für das geschriebene Symbol */
  tapeAlphabet: string[]
  blank: string
  /** Bisheriger Inhalt der Zelle – `null` = leer */
  cell: TuringCell | null
  /**
   * `newStateLabel` gesetzt = Folgezustand mit diesem Namen neu anlegen (`cell.to` wird
   * ignoriert, leer = nächste freie Bezeichnung)
   */
  onApply(cell: TuringCell, newStateLabel?: string): void
  onRemove(): void
  onClose(): void
}

/**
 * Kleines Fenster für eine Zelle der Turing-Tabelle: δ(q, a) = (Folgezustand, Schreiben,
 * Bewegung). Bei wenigen Möglichkeiten Knöpfe, sonst tippen mit Vorschlagsliste – ein getippter
 * unbekannter Zustand wird neu angelegt. Enter übernimmt, Esc schließt, L/N/R wählt die Bewegung.
 */
export function TuringCellDialog({
  graph,
  from,
  read,
  tapeAlphabet,
  blank,
  cell,
  onApply,
  onRemove,
  onClose
}: TuringCellDialogProps) {
  // Leere Zelle: Schleife, Symbol bleibt stehen, Kopf bleibt stehen
  const [to, setTo] = useState<StateId>(cell?.to ?? from)
  const [newLabel, setNewLabel] = useState(() => nextStateLabel(graph))
  const [write, setWrite] = useState(cell?.write ?? read)
  const [move, setMove] = useState<TapeMove>(cell?.move ?? documentDefaults().tapeMove)
  const [error, setError] = useState<string | null>(null)
  const labelOf = (id: StateId): string => graph.states.find((s) => s.id === id)?.label ?? '?'

  const apply = (): void =>
    onApply({ to, write, move }, to === NEW_STATE ? newLabel : undefined)

  const chooseNewState = (label = nextStateLabel(graph)): void => {
    setNewLabel(label)
    setTo(NEW_STATE)
  }

  /** Getippter Zustand: vorhandenen nehmen, sonst einen mit diesem Namen anlegen */
  const commitState = (input: string): boolean => {
    const label = input.replace(/^\+\s*/, '').trim()
    if (!label) return false
    setError(null)
    const existing = graph.states.find((s) => s.label === label)
    if (existing) setTo(existing.id)
    else chooseNewState(label)
    return true
  }

  /** Getipptes Symbol muss in Γ sein („_“ = Blank) */
  const commitWrite = (input: string): boolean => {
    const symbol = normalizeTapeSymbol(input, blank, tapeAlphabet) || blank
    if (!tapeAlphabet.includes(symbol)) {
      setError(`„${symbol}“ nicht im Bandalphabet`)
      return false
    }
    setError(null)
    setWrite(symbol)
    return true
  }

  // Solange das Fenster offen ist, ruhen die Tastenkürzel der Screens
  useEffect(() => {
    useDialogStore.getState().setWindowOpen(true)
    return () => useDialogStore.getState().setWindowOpen(false)
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      // In den Eingabefeldern gehören Buchstaben, Enter und Esc der Vorschlagsliste
      if (e.ctrlKey || e.metaKey || e.altKey || isEditableTarget(e.target)) return
      const key = e.key.toUpperCase()
      if (e.key === 'Escape') onClose()
      else if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) apply()
      else if (TAPE_MOVES.includes(key as TapeMove)) setMove(key as TapeMove)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  const toggle = (
    key: string,
    label: string,
    active: boolean,
    onClick: () => void,
    title?: string
  ) => (
    <button
      key={key}
      className={classNames('symbol-toggle', active && 'is-active')}
      aria-pressed={active}
      title={title}
      onClick={onClick}
    >
      {label}
    </button>
  )

  const selectAll = (e: { currentTarget: HTMLInputElement }): void => e.currentTarget.select()

  return (
    <div
      className="dialog-backdrop"
      ref={inertOutside}
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="dialog turing-cell-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="turing-cell-title"
      >
        <h2 id="turing-cell-title" className="dialog-title is-mono">
          δ({labelOf(from)}, {read})
        </h2>

        <div className="field">
          <span className="field-label">Folgezustand</span>
          {graph.states.length + 1 <= MAX_BUTTONS ? (
            <div className="symbol-toggles" role="group" aria-label="Folgezustand">
              {graph.states.map((s) => toggle(s.id, s.label, to === s.id, () => setTo(s.id)))}
              {toggle(
                NEW_STATE,
                `+ ${nextStateLabel(graph)}`,
                to === NEW_STATE,
                () => chooseNewState(),
                'Neuer Zustand'
              )}
            </div>
          ) : (
            <ComboInput
              className="is-mono"
              aria-label="Folgezustand"
              value={to === NEW_STATE ? `+ ${newLabel}` : labelOf(to)}
              options={graph.states.map((s) => s.label)}
              actions={[{ label: '+ neuer Zustand', onSelect: () => chooseNewState() }]}
              onFocus={selectAll}
              onCommit={commitState}
            />
          )}
        </div>

        <div className="field">
          <span className="field-label">Schreiben</span>
          {tapeAlphabet.length <= MAX_BUTTONS ? (
            <div className="symbol-toggles" role="group" aria-label="Schreiben">
              {tapeAlphabet.map((s) => toggle(s, s, write === s, () => setWrite(s)))}
            </div>
          ) : (
            <ComboInput
              className="is-mono"
              aria-label="Schreiben"
              value={write}
              options={tapeAlphabet}
              onFocus={selectAll}
              onCommit={commitWrite}
            />
          )}
        </div>

        <div className="field">
          <span className="field-label">Bewegung</span>
          <div className="segmented" role="radiogroup" aria-label="Bewegung">
            {TAPE_MOVES.map((m) => (
              <button
                key={m}
                role="radio"
                aria-checked={move === m}
                title={MOVE_TITLES[m]}
                className={classNames('segmented-option', move === m && 'is-active')}
                onClick={() => setMove(m)}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="table-error">{error}</p>}

        <div className="dialog-buttons">
          {cell && (
            <button className="btn is-danger turing-cell-remove" onClick={onRemove}>
              Entfernen
            </button>
          )}
          <button className="btn is-primary" autoFocus onClick={apply} title="Übernehmen (Enter)">
            Übernehmen
          </button>
          <button className="btn" onClick={onClose} title="Abbrechen (Esc)">
            Abbrechen
          </button>
        </div>
      </div>
    </div>
  )
}

import { useEffect, useRef } from 'react'
import { formatLabel, formatWord } from '@/core/automaton/labels'
import { tokenizeWord } from '@/core/automaton/word'
import { outputSettings, outputsOnStates } from '@/model/graph'
import { useEditorStore } from '@/store/editorStore'
import { classNames } from '@/utils/dom'
import type { SimulationControls } from './useSimulation'

/**
 * Transduktor: Eingabe über Ausgabe. Jede Spalte gehört zu einem Eingabesymbol, darunter steht
 * das Stück Ausgabe, das beim Lesen dieses Symbols entstanden ist. Beim Moore-Automaten kommt
 * vorn eine Spalte „Start“ für λ(z₀) dazu – die Ausgabe vor dem ersten Zeichen.
 *
 * Die Spalte des letzten Schritts ist hervorgehoben (am Ende grün bzw. rot); ein gerade
 * erzeugtes Stück bekommt einen neuen React-key und blendet kurz ein. Rechts oben steht die
 * ganze Ausgabe bis hierher.
 */
export function SimulationOutput({ sim }: { sim: SimulationControls }) {
  const doc = useEditorStore((s) => s.document)
  const moore = outputsOnStates(doc.type)
  const delta = outputSettings(doc).alphabet
  const tokens = tokenizeWord(sim.word, doc.alphabet)
  const current = sim.steps[sim.index]
  const pieces = current?.output ?? []
  const position = current?.inputPosition ?? -1
  const outcome = sim.status === 'accepted' || sim.status === 'rejected' ? sim.status : null

  /** Spalten: (Moore: Start) + ein Eingabesymbol je Spalte; `step` = Schritt, der sie füllt */
  const columns = [
    ...(moore ? [{ input: null as string | null, step: 0 }] : []),
    ...tokens.map((input, i) => ({ input, step: i + 1 }))
  ]
  const currentRef = useRef<HTMLDivElement>(null)

  // Mit Block-Rumpf: scrollIntoView liefert in Chromium ein Promise (siehe SimulationTrace)
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [sim.index])

  return (
    <section
      className={classNames('sim-output-panel', outcome && `is-${outcome}`)}
      aria-label="Ausgabe"
    >
      <header className="sim-output-header">
        <span className="sim-section-label">Ausgabe</span>
        <span className="sim-output-rule">
          {current?.label ? formatLabel(current.label, delta) : ' '}
        </span>
        <span className="sim-output-word">
          {current ? formatWord(pieces.flat(), delta) : ' '}
        </span>
      </header>
      <div className="sim-output-view">
        <div className="sim-output-names" aria-hidden="true">
          <span>Eingabe</span>
          <span>Ausgabe</span>
        </div>
        <div className="sim-output-columns">
          {columns.length === 0 && (
            <div className="sim-output-column is-empty">
              <span className="sim-output-cell is-input">ε</span>
              <span className="sim-output-cell is-output" />
            </div>
          )}
          {columns.map(({ input, step }) => {
            const piece = step < pieces.length ? pieces[step] : null
            const isCurrent = current !== undefined && step === position
            return (
              <div
                key={step}
                ref={isCurrent ? currentRef : undefined}
                className={classNames(
                  'sim-output-column',
                  isCurrent && 'is-current',
                  current !== undefined && step < position && 'is-done',
                  current !== undefined && step === position + 1 && 'is-next',
                  input === null && 'is-start'
                )}
              >
                <span className="sim-output-cell is-input">{input ?? 'Start'}</span>
                <span
                  // Neuer key, sobald das Stück erscheint – die CSS-Animation startet dann neu
                  key={piece === null ? 'leer' : 'voll'}
                  className={classNames(
                    'sim-output-cell',
                    'is-output',
                    piece !== null && piece.length === 0 && 'is-epsilon'
                  )}
                >
                  {piece === null ? '' : formatWord(piece, delta)}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

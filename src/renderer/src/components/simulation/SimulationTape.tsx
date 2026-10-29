import { formatLabel } from '@/core/automaton/labels'
import { tokenizeWord } from '@/core/automaton/word'
import { tapeSettings, type TapeMove } from '@/model/graph'
import { useEditorStore } from '@/store/editorStore'
import { classNames } from '@/utils/dom'
import type { SimulationControls } from './useSimulation'

/** Breite einer Bandzelle in px – muss zu `--tape-cell` in app.css passen */
const CELL = 44
/** So viele Zellen links und rechts vom Kopf werden gezeichnet (reicht für breite Fenster) */
const RADIUS = 30
const OFFSET: Record<TapeMove, number> = { L: -1, R: 1, N: 0 }

/**
 * Turingmaschine: das Band der angezeigten Konfiguration. Der Kopf (Rahmen mit Zustand) steht
 * fest in der Mitte, das Band gleitet bei jedem Schritt animiert darunter nach links/rechts.
 *
 * Jede Zelle sitzt an ihrer festen Bandposition im Streifen (`left = Position · Zellbreite`);
 * verschoben wird nur der ganze Streifen per `transform`. So bleiben die Zellen beim Gleiten
 * dieselben DOM-Elemente und die CSS-Transition bewegt alles gemeinsam. Eine gerade
 * beschriebene Zelle bekommt einen neuen React-key und blendet kurz ein.
 */
export function SimulationTape({ sim }: { sim: SimulationControls }) {
  const doc = useEditorStore((s) => s.document)
  const { blank } = tapeSettings(doc)
  const current = sim.steps[sim.index]
  const live = current !== undefined

  // Vor dem Start: Eingabewort ab Zelle 0, Kopf auf Zelle 0, Startzustand
  const tape = current?.tape ?? { start: 0, symbols: tokenizeWord(sim.word, doc.alphabet) }
  const head = current?.head ?? 0
  const stateId = current ? current.activeStateIds[0] : doc.graph.states.find((s) => s.isStart)?.id
  const stateLabel = doc.graph.states.find((s) => s.id === stateId)?.label ?? '–'
  const read = (position: number): string => tape.symbols[position - tape.start] ?? blank

  /** Zuletzt beschriebene Zelle (vor der Bewegung des Kopfes) */
  const written = current?.label ? head - OFFSET[current.label.move ?? 'N'] : null
  const outcome = sim.status === 'accepted' || sim.status === 'rejected' ? sim.status : null
  // Beim schnellen Abspielen kürzer gleiten, damit der Schritt vor dem nächsten fertig ist
  const duration = Math.min(320, (0.8 * 1000) / sim.speed)

  const cells: number[] = []
  for (let p = head - RADIUS; p <= head + RADIUS; p++) cells.push(p)

  return (
    <section className={classNames('sim-tape-panel', outcome && `is-${outcome}`)} aria-label="Band">
      <header className="sim-tape-header">
        <span className="sim-section-label">Band</span>
        <span className="sim-tape-rule">{current?.label ? formatLabel(current.label) : ' '}</span>
        <span className="sim-tape-position">{head}</span>
      </header>
      <div className="sim-tape-view">
        <div className="sim-tape-head" aria-label={`Kopf in ${stateLabel}`}>
          <span className="sim-tape-state">{stateLabel}</span>
          <span className="sim-tape-pointer" />
        </div>
        <div
          className={classNames('sim-tape-strip', live && 'is-live')}
          style={{
            transform: `translateX(${-(head + 0.5) * CELL}px)`,
            // Vor dem Start springt das Band (neues Wort), danach gleitet es
            ...(live ? { transitionDuration: `${duration}ms` } : {})
          }}
        >
          {cells.map((p) => {
            const symbol = read(p)
            return (
              <span
                key={`${p}:${symbol}`}
                className={classNames(
                  'sim-tape-cell',
                  p === head && 'is-head',
                  symbol === blank && 'is-blank',
                  live && p === written && 'is-written'
                )}
                style={{ left: p * CELL }}
              >
                {symbol}
              </span>
            )
          })}
        </div>
        <span className="sim-tape-frame" />
      </div>
    </section>
  )
}

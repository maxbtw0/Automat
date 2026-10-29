import { memo, useCallback, useEffect, useRef, type Ref } from 'react'
import { formatLabel, formatStack, formatTape } from '@/core/automaton/labels'
import { getAutomatonDefinition } from '@/core/automaton/registry'
import type { SimulationStep } from '@/core/automaton/types'
import { usesStack, usesTape } from '@/model/graph'
import { useEditorStore } from '@/store/editorStore'
import { classNames } from '@/utils/dom'
import { formatStateSet } from '@/utils/format'
import type { SimulationControls } from './useSimulation'

/**
 * Tabelle der Konfigurationen: Schritt · gelesenes Symbol · Zustand · Resteingabe.
 * Kellerautomat: Schritt · Regel · Zustand · Resteingabe · Stack – also (q, w, γ).
 * Turingmaschine: Schritt · Regel · Zustand · Band mit Kopf in eckigen Klammern.
 */
export function SimulationTrace({ sim }: { sim: SimulationControls }) {
  const states = useEditorStore((s) => s.document.graph.states)
  const type = useEditorStore((s) => s.document.type)
  const gamma = useEditorStore((s) => s.document.stack?.alphabet)
  const single = getAutomatonDefinition(type).singlePath
  const hasStack = usesStack(type)
  const hasTape = usesTape(type)
  const hasRule = hasStack || hasTape
  const columns = hasStack ? 5 : 4
  const currentRowRef = useRef<HTMLTableRowElement>(null)

  // Mit Block-Rumpf: scrollIntoView liefert in neueren Chromium-Versionen ein Promise, und ein
  // zurückgegebenes Promise hält React für eine Aufräumfunktion (Absturz beim Unmount).
  useEffect(() => {
    currentRowRef.current?.scrollIntoView({ block: 'nearest' })
  }, [sim.index])

  const labelOf = (id: string): string => states.find((s) => s.id === id)?.label ?? '?'
  const formatStates = (ids: string[]): string => formatStateSet(ids.map(labelOf), single)
  // Stabil über alle Renderings, damit unveränderte Zeilen (memo) nicht neu gezeichnet werden
  const goToRef = useRef(sim.goTo)
  goToRef.current = sim.goTo
  const select = useCallback((i: number) => goToRef.current(i), [])

  const finalOutcome =
    sim.status === 'accepted' || sim.status === 'rejected' ? sim.status : undefined

  return (
    <section className="sim-trace">
      <table className="data-table is-wide sim-trace-table">
        <thead>
          <tr>
            <th className="is-index">#</th>
            <th>{hasRule ? 'Regel' : 'Gelesen'}</th>
            <th>Zustand</th>
            <th>{hasTape ? 'Band' : 'Resteingabe'}</th>
            {hasStack && <th>Stack</th>}
          </tr>
        </thead>
        <tbody>
          {sim.steps.length === 0 && (
            <tr>
              <td colSpan={columns} className="muted">
                noch nicht gestartet
              </td>
            </tr>
          )}
          {sim.steps.map((step, i) => {
            const isCurrent = i === sim.index
            const isLast = i === sim.steps.length - 1
            return (
              <TraceRow
                key={step.index}
                step={step}
                position={i}
                rowRef={isCurrent ? currentRowRef : undefined}
                isCurrent={isCurrent}
                outcome={isLast ? finalOutcome : undefined}
                states={formatStates(step.activeStateIds)}
                hasRule={hasRule}
                hasStack={hasStack}
                gamma={gamma}
                onSelect={select}
              />
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

interface TraceRowProps {
  step: SimulationStep
  /** Index in `steps` */
  position: number
  rowRef?: Ref<HTMLTableRowElement>
  isCurrent: boolean
  outcome?: 'accepted' | 'rejected'
  /** Zustand(smenge) als Text */
  states: string
  hasRule: boolean
  hasStack: boolean
  gamma?: string[]
  onSelect(position: number): void
}

/**
 * Eine Konfiguration. `memo`: Beim Abspielen kommt pro Schritt eine Zeile dazu – die übrigen
 * bleiben, wie sie sind (das Band der Turingmaschine wird pro Zeile nur einmal formatiert).
 */
const TraceRow = memo(function TraceRow({
  step,
  position,
  rowRef,
  isCurrent,
  outcome,
  states,
  hasRule,
  hasStack,
  gamma,
  onSelect
}: TraceRowProps) {
  return (
    <tr
      ref={rowRef}
      className={classNames('is-clickable', isCurrent && 'is-selected', outcome && `is-${outcome}`)}
      onClick={() => onSelect(position)}
    >
      <td className="is-index">{step.index}</td>
      <td className="is-mono">
        {hasRule ? (step.label ? formatLabel(step.label, gamma) : '–') : (step.symbol ?? '–')}
      </td>
      <td className="is-mono">{states}</td>
      <td className="is-mono">
        {step.tape ? formatTape(step.tape, step.head ?? 0) : step.remaining || 'ε'}
      </td>
      {hasStack && <td className="is-mono">{formatStack(step.stack ?? [], gamma)}</td>}
    </tr>
  )
})

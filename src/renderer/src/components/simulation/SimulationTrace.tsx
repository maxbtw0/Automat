import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  formatLabel,
  formatStack,
  formatTape,
  formatWord,
  labelWordAlphabet
} from '@/core/automaton/labels'
import { getAutomatonDefinition } from '@/core/automaton/registry'
import type { SimulationStep, TapeSnapshot } from '@/core/automaton/types'
import { usesOutput, usesStack, usesTape } from '@/model/graph'
import { useEditorStore } from '@/store/editorStore'
import { classNames } from '@/utils/dom'
import { formatStateSet } from '@/utils/format'
import type { SimulationControls } from './useSimulation'

/** So viele Zeilen werden über und unter dem sichtbaren Bereich zusätzlich gezeichnet */
const OVERSCAN = 20
/** Zeilenhöhe, bis eine echte Zeile gemessen ist */
const DEFAULT_ROW_HEIGHT = 30
/** Band in der Zeile: so viele Zellen links und rechts vom Kopf, der Rest als „…“ */
const TAPE_CONTEXT = 30

/**
 * Tabelle der Konfigurationen: Schritt · gelesenes Symbol · Zustand · Resteingabe.
 * Kellerautomat: Schritt · Regel · Zustand · Resteingabe · Stack – also (q, w, γ).
 * Turingmaschine: Schritt · Regel · Zustand · Band mit Kopf in eckigen Klammern.
 * Transduktor: zusätzlich die Ausgabe bis hierher (Mealy: Regel „a/0“ statt Gelesen).
 */
export function SimulationTrace({ sim }: { sim: SimulationControls }) {
  const states = useEditorStore((s) => s.document.graph.states)
  const type = useEditorStore((s) => s.document.type)
  const gamma = useEditorStore((s) => labelWordAlphabet(s.document))
  const single = getAutomatonDefinition(type).singlePath
  const hasStack = usesStack(type)
  const hasTape = usesTape(type)
  const hasOutput = usesOutput(type)
  const hasRule = hasStack || hasTape || type === 'MEALY'
  const columns = hasStack || hasOutput ? 5 : 4

  // Lange Läufe haben Tausende Zeilen – gezeichnet werden nur die sichtbaren (plus Puffer).
  const scrollRef = useRef<HTMLElement>(null)
  const bodyRef = useRef<HTMLTableSectionElement>(null)
  const [view, setView] = useState({ top: 0, height: 600 })
  /** Zeilenhöhe und Abstand der ersten Zeile vom Anfang des scrollbaren Inhalts */
  const [metrics, setMetrics] = useState({ row: DEFAULT_ROW_HEIGHT, offset: 0 })

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const update = (): void => setView({ top: el.scrollTop, height: el.clientHeight })
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    el.addEventListener('scroll', update, { passive: true })
    return () => {
      observer.disconnect()
      el.removeEventListener('scroll', update)
    }
  }, [])

  // Nach jedem Zeichnen nachmessen – ändert sich nur, wenn Schrift oder Kopfzeile es tun
  useLayoutEffect(() => {
    const el = scrollRef.current
    const rows = bodyRef.current?.querySelectorAll<HTMLElement>('tr.is-clickable')
    if (!el || !rows || rows.length < 2) return
    const first = rows[0].getBoundingClientRect()
    const row = rows[1].getBoundingClientRect().top - first.top
    const before = Number(rows[0].dataset.position)
    const offset = first.top - el.getBoundingClientRect().top + el.scrollTop - before * row
    if (Math.abs(row - metrics.row) > 0.5 || Math.abs(offset - metrics.offset) > 0.5) {
      setMetrics({ row, offset })
    }
  })

  // Aktuelle Zeile sichtbar halten (wie scrollIntoView „nearest“, auch wenn sie nicht gezeichnet ist)
  useEffect(() => {
    const el = scrollRef.current
    if (!el || sim.steps.length === 0) return
    const top = metrics.offset + sim.index * metrics.row
    if (top < el.scrollTop) el.scrollTop = top
    else if (top + metrics.row > el.scrollTop + el.clientHeight) {
      el.scrollTop = top + metrics.row - el.clientHeight
    }
  }, [sim.index, sim.steps.length, metrics])

  const total = sim.steps.length
  const from = Math.max(0, Math.floor((view.top - metrics.offset) / metrics.row) - OVERSCAN)
  const to = Math.min(
    total,
    Math.ceil((view.top + view.height - metrics.offset) / metrics.row) + OVERSCAN
  )

  const labelOf = (id: string): string => states.find((s) => s.id === id)?.label ?? '?'
  const formatStates = (ids: string[]): string => formatStateSet(ids.map(labelOf), single)
  // Stabil über alle Renderings, damit unveränderte Zeilen (memo) nicht neu gezeichnet werden
  const goToRef = useRef(sim.goTo)
  goToRef.current = sim.goTo
  const select = useCallback((i: number) => goToRef.current(i), [])

  const finalOutcome =
    sim.status === 'accepted' || sim.status === 'rejected' ? sim.status : undefined

  return (
    <section ref={scrollRef} className="sim-trace">
      <table className="data-table is-wide sim-trace-table">
        <thead>
          <tr>
            <th className="is-index">#</th>
            <th>{hasRule ? 'Regel' : 'Gelesen'}</th>
            <th>Zustand</th>
            <th>{hasTape ? 'Band' : 'Resteingabe'}</th>
            {hasStack && <th>Stack</th>}
            {hasOutput && <th>Ausgabe</th>}
          </tr>
        </thead>
        <tbody ref={bodyRef}>
          {total === 0 && (
            <tr>
              <td colSpan={columns} className="muted">
                noch nicht gestartet
              </td>
            </tr>
          )}
          {from > 0 && <Spacer height={from * metrics.row} columns={columns} />}
          {sim.steps.slice(from, to).map((step, offset) => {
            const i = from + offset
            const isCurrent = i === sim.index
            const isLast = i === total - 1
            return (
              <TraceRow
                key={step.index}
                step={step}
                position={i}
                isCurrent={isCurrent}
                outcome={isLast ? finalOutcome : undefined}
                states={formatStates(step.activeStateIds)}
                hasRule={hasRule}
                hasStack={hasStack}
                hasOutput={hasOutput}
                gamma={gamma}
                onSelect={select}
              />
            )
          })}
          {to < total && <Spacer height={(total - to) * metrics.row} columns={columns} />}
        </tbody>
      </table>
    </section>
  )
}

/** Platzhalter für nicht gezeichnete Zeilen – hält die Scrollhöhe */
function Spacer({ height, columns }: { height: number; columns: number }) {
  return (
    <tr className="sim-trace-spacer" style={{ height }} aria-hidden="true">
      <td colSpan={columns} />
    </tr>
  )
}

/** Band um den Kopf herum: höchstens `TAPE_CONTEXT` Zellen auf jeder Seite */
function formatTapeAround(tape: TapeSnapshot, head: number): string {
  const from = Math.max(0, head - TAPE_CONTEXT - tape.start)
  const to = Math.min(tape.symbols.length, head + TAPE_CONTEXT + 1 - tape.start)
  if (from === 0 && to === tape.symbols.length) return formatTape(tape, head)
  const text = formatTape({ start: tape.start + from, symbols: tape.symbols.slice(from, to) }, head)
  return `${from > 0 ? '…' : ''}${text}${to < tape.symbols.length ? '…' : ''}`
}

interface TraceRowProps {
  step: SimulationStep
  /** Index in `steps` */
  position: number
  isCurrent: boolean
  outcome?: 'accepted' | 'rejected'
  /** Zustand(smenge) als Text */
  states: string
  hasRule: boolean
  hasStack: boolean
  hasOutput: boolean
  /** Γ beim Kellerautomaten, Δ beim Transduktor */
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
  isCurrent,
  outcome,
  states,
  hasRule,
  hasStack,
  hasOutput,
  gamma,
  onSelect
}: TraceRowProps) {
  return (
    <tr
      data-position={position}
      className={classNames('is-clickable', isCurrent && 'is-selected', outcome && `is-${outcome}`)}
      onClick={() => onSelect(position)}
    >
      <td className="is-index">{step.index}</td>
      <td className="is-mono">
        {hasRule ? (step.label ? formatLabel(step.label, gamma) : '–') : (step.symbol ?? '–')}
      </td>
      <td className="is-mono">{states}</td>
      <td className="is-mono">
        {step.tape ? formatTapeAround(step.tape, step.head ?? 0) : step.remaining || 'ε'}
      </td>
      {hasStack && <td className="is-mono">{formatStack(step.stack ?? [], gamma)}</td>}
      {hasOutput && <td className="is-mono">{formatWord((step.output ?? []).flat(), gamma)}</td>}
    </tr>
  )
})

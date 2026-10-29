import { formatLabel } from '@/core/automaton/labels'
import { useEditorStore } from '@/store/editorStore'
import { classNames } from '@/utils/dom'
import type { SimulationControls } from './useSimulation'

/**
 * Kellerautomat: der Stack der angezeigten Konfiguration, rechts oben neben dem Graphen.
 * Der Stack wächst von unten nach oben, das oberste Symbol ist hervorgehoben. Darüber steht
 * die zuletzt angewendete Regel. Vor dem Start: Stack mit dem Stack-Startsymbol.
 *
 * Die Zellen sind vom Boden aus nummeriert – neu abgelegte Symbole bekommen einen neuen
 * React-key und blenden kurz ein.
 */
export function SimulationStack({ sim }: { sim: SimulationControls }) {
  const stackStart = useEditorStore((s) => s.document.stack?.start ?? null)
  const gamma = useEditorStore((s) => s.document.stack?.alphabet)
  const current = sim.steps[sim.index]
  const live = current !== undefined
  const stack = current?.stack ?? (stackStart === null ? [] : [stackStart])
  // Oberstes Symbol zuerst; kurze Stack stehen unten (CSS), lange scrollen ab dem obersten
  const cells = stack.map((symbol, i) => ({ symbol, key: `${i}:${symbol}` })).reverse()

  return (
    <section className="sim-stack-panel" aria-label="Stack">
      <header className="sim-stack-header">
        <span className="sim-section-label">Stack</span>
        <span className="sim-stack-height">{stack.length}</span>
      </header>
      <div className="sim-stack-rule">{current?.label ? formatLabel(current.label, gamma) : ' '}</div>
      <div className={classNames('sim-stack', live && 'is-live')}>
        {cells.length === 0 ? (
          <span className="sim-stack-cell is-empty">ε</span>
        ) : (
          cells.map((cell, i) => (
            <span
              key={cell.key}
              className={classNames('sim-stack-cell', i === 0 && 'is-top')}
            >
              {cell.symbol}
            </span>
          ))
        )}
      </div>
    </section>
  )
}

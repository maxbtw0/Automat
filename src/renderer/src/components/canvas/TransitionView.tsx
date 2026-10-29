import type { MouseEvent, PointerEvent } from 'react'
import { labelLines } from '@/core/automaton/labels'
import { MONO, measureText } from '@/export/svg'
import type { TransitionEdge } from '@/model/graph'
import { classNames } from '@/utils/dom'
import { labelCenter, labelLineYs, type EdgeGeometry } from '@/utils/geometry'

interface TransitionViewProps {
  transition: TransitionEdge
  geometry: EdgeGeometry
  selected: boolean
  active: boolean
  /** Kurz abdimmen (Simulation: Übergang wird erneut benutzt) – Dauer in ms */
  pulseMs?: number
  /** Stackalphabet Γ – trennt Push-Wörter, die sonst mehrdeutig wären („A B“ bei AB ∈ Γ) */
  stackAlphabet?: string[]
  onPointerDown(e: PointerEvent<SVGGElement>, transition: TransitionEdge): void
  onDoubleClick(e: MouseEvent<SVGGElement>, transition: TransitionEdge): void
  onContextMenu(e: MouseEvent<SVGGElement>, transition: TransitionEdge): void
}

export function TransitionView({
  transition,
  geometry,
  selected,
  active,
  pulseMs,
  stackAlphabet,
  onPointerDown,
  onDoubleClick,
  onContextMenu
}: TransitionViewProps) {
  const isEmpty = transition.labels.length === 0
  // Stackregeln: eine Zeile pro Regel, der Block wächst vom Übergang weg
  const lines = isEmpty ? ['?'] : labelLines(transition.labels, stackAlphabet)
  const width = Math.max(...lines.map((line) => measureText(line, MONO, 13)))
  const center = labelCenter(geometry, width, lines.length)
  const marker = active ? 'arrow-active' : selected ? 'arrow-selected' : 'arrow'

  return (
    <g
      className={classNames(
        'transition',
        selected && 'is-selected',
        active && 'is-active',
        pulseMs !== undefined && 'is-pulse'
      )}
      style={pulseMs !== undefined ? { animationDuration: `${pulseMs}ms` } : undefined}
      onPointerDown={(e) => onPointerDown(e, transition)}
      onDoubleClick={(e) => onDoubleClick(e, transition)}
      onContextMenu={(e) => onContextMenu(e, transition)}
    >
      <path className="transition-hit" d={geometry.path} />
      <path className="transition-line" d={geometry.path} markerEnd={`url(#${marker})`} />
      <text className={classNames('transition-label', isEmpty && 'is-empty')} textAnchor="middle">
        {labelLineYs(center.y, lines.length).map((y, i) => (
          <tspan key={i} x={center.x} y={y} dominantBaseline="central">
            {lines[i]}
          </tspan>
        ))}
      </text>
    </g>
  )
}

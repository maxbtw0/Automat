import type { MouseEvent, PointerEvent } from 'react'
import type { StateNode } from '@/model/graph'
import { classNames } from '@/utils/dom'
import { STATE_RADIUS } from '@/utils/geometry'

interface StateNodeViewProps {
  state: StateNode
  selected: boolean
  active: boolean
  /** Aktiv, aber nicht auf dem hervorgehobenen Pfad (NEA) – nur dezent markiert */
  reachable?: boolean
  outcome?: 'accepted' | 'rejected'
  /** Akzeptiert auch ohne Endzustand (Kellerautomat mit leerem Stack, Transduktor) */
  acceptAny?: boolean
  /** Angezeigter Text – Standard der Name, beim Moore-Automaten „q0/1“ */
  text?: string
  /** Kurz abdimmen (Simulation: Zustand bleibt aktiv) – Dauer in ms */
  pulseMs?: number
  onPointerDown(e: PointerEvent<SVGGElement>, state: StateNode): void
  onDoubleClick(e: MouseEvent<SVGGElement>, state: StateNode): void
  onContextMenu(e: MouseEvent<SVGGElement>, state: StateNode): void
}

const R = STATE_RADIUS

export function StateNodeView({
  state,
  selected,
  active,
  reachable = false,
  outcome,
  acceptAny = false,
  text = state.label,
  pulseMs,
  onPointerDown,
  onDoubleClick,
  onContextMenu
}: StateNodeViewProps) {
  return (
    <g
      className={classNames(
        'state',
        selected && 'is-selected',
        active && 'is-active',
        reachable && !active && 'is-reachable',
        // Akzeptiert: nur die aktiven Endzustände grün – beim NEA sieht man so den Zweig,
        // der akzeptiert. Verworfen: alle aktiven Zustände rot.
        active && outcome === 'rejected' && 'is-rejected',
        active && outcome === 'accepted' && (state.isFinal || acceptAny) && 'is-accepted',
        pulseMs !== undefined && 'is-pulse'
      )}
      style={pulseMs !== undefined ? { animationDuration: `${pulseMs}ms` } : undefined}
      transform={`translate(${state.x} ${state.y})`}
      onPointerDown={(e) => onPointerDown(e, state)}
      onDoubleClick={(e) => onDoubleClick(e, state)}
      onContextMenu={(e) => onContextMenu(e, state)}
    >
      {state.isStart && (
        <path
          className="state-start-arrow"
          d={`M ${-R - 36} 0 L ${-R} 0`}
          markerEnd="url(#arrow-start)"
        />
      )}
      <circle className="state-circle" r={R} />
      {state.isFinal && <circle className="state-final-ring" r={R - 5} />}
      <text className="state-label" textAnchor="middle" dominantBaseline="central">
        {text}
      </text>
    </g>
  )
}

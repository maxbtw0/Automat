import { stateName, type EditorGraph, type StateId } from '@/model/graph'

const COLUMN_SPACING = 180
const ROW_SPACING = 120
const MARGIN = 120

/** Breitensuche vom Startzustand: Zustände in Besuchsreihenfolge mit ihrem Abstand vom Start. */
function breadthFirst(graph: EditorGraph): { order: StateId[]; depth: Map<StateId, number> } {
  const depth = new Map<StateId, number>()
  const order: StateId[] = []
  const start = graph.states.find((s) => s.isStart)
  if (start) {
    depth.set(start.id, 0)
    order.push(start.id)
  }
  for (let i = 0; i < order.length; i++) {
    const current = order[i]
    for (const t of graph.transitions) {
      if (t.from !== current || depth.has(t.to)) continue
      depth.set(t.to, (depth.get(current) ?? 0) + 1)
      order.push(t.to)
    }
  }
  // Unerreichbare Zustände ganz rechts anhängen
  const maxDepth = Math.max(-1, ...depth.values())
  for (const s of graph.states) {
    if (depth.has(s.id)) continue
    depth.set(s.id, maxDepth + 1)
    order.push(s.id)
  }
  return { order, depth }
}

/**
 * Ordnet erzeugte Automaten übersichtlich an: Spalte = Abstand vom Start (Breitensuche),
 * Zeile = Reihenfolge innerhalb der Spalte. Jede zweite Spalte ist um eine halbe Zeile
 * versetzt, damit lange Rückwärtskanten nicht quer durch die Zustände dazwischen laufen.
 */
export function layoutByDepth(graph: EditorGraph): EditorGraph {
  const { order, depth } = breadthFirst(graph)
  const rowsPerColumn: number[] = []
  const position = new Map<StateId, { x: number; y: number }>()
  for (const id of order) {
    const column = depth.get(id) ?? 0
    const row = rowsPerColumn[column] ?? 0
    rowsPerColumn[column] = row + 1
    position.set(id, {
      x: MARGIN + column * COLUMN_SPACING,
      y: MARGIN + row * ROW_SPACING + (column % 2) * (ROW_SPACING / 2)
    })
  }
  return {
    ...graph,
    states: graph.states.map((s) => ({ ...s, ...position.get(s.id) }))
  }
}

/** Benennt die Zustände in Besuchsreihenfolge q0, q1, q2, … (Start = q0, Präfix aus den Vorgaben). */
export function relabelInOrder(graph: EditorGraph): EditorGraph {
  const { order } = breadthFirst(graph)
  const label = new Map(order.map((id, i) => [id, stateName(i)]))
  return { ...graph, states: graph.states.map((s) => ({ ...s, label: label.get(s.id) ?? s.label })) }
}

import { startState } from '@/core/automaton/validation'
import {
  EPSILON,
  createId,
  edgeSymbols,
  type AutomatonDocument,
  type StateId,
  type StateNode,
  type TransitionEdge
} from '@/model/graph'
import { freshStateId, usedStateIds } from './ids'
import { layoutByDepth } from './layout'

/**
 * Minimierung eines DEA durch Verfeinerung der Zustandsklassen (Verfahren nach Moore).
 *
 * 1. Nur vom Start erreichbare Zustände behalten. Fehlende Übergänge zeigen auf einen
 *    unsichtbaren Fangzustand – so ist δ vollständig.
 * 2. Startaufteilung: Endzustände | Nicht-Endzustände.
 * 3. Verfeinern: Zwei Zustände bleiben nur dann in einer Klasse, wenn sie für jedes Symbol
 *    in dieselbe Klasse wechseln. Wiederholen, bis sich nichts mehr ändert.
 * 4. Jede Klasse wird ein Zustand. Die Klasse des Fangzustands (Zustände, von denen aus kein
 *    Endzustand mehr erreichbar ist) fällt wieder weg – der DEA bleibt partiell.
 *
 * Zusammengelegte Zustände heißen z. B. „q1/q3“.
 */
export function minimizeDfa(document: AutomatonDocument): AutomatonDocument {
  const { graph } = document
  const start = startState(graph)
  if (!start) throw new Error('Kein Startzustand – Minimierung nicht möglich.')

  const alphabet = [
    ...new Set([
      ...document.alphabet,
      ...graph.transitions.flatMap(edgeSymbols).filter((s) => s !== EPSILON)
    ])
  ]

  // δ als Tabelle; ein zweiter Folgezustand für dasselbe Symbol wäre Nichtdeterminismus
  const delta = new Map<StateId, Map<string, StateId>>()
  for (const t of graph.transitions) {
    for (const symbol of edgeSymbols(t)) {
      if (symbol === EPSILON) throw new Error('Der Automat hat ε-Übergänge.')
      const row = delta.get(t.from) ?? new Map<string, StateId>()
      const existing = row.get(symbol)
      if (existing !== undefined && existing !== t.to) {
        throw new Error('Der Automat ist nicht deterministisch.')
      }
      row.set(symbol, t.to)
      delta.set(t.from, row)
    }
  }
  /** Unsichtbarer Fangzustand: Ziel aller fehlenden Übergänge (partieller DEA → vollständig) */
  const TRAP = freshStateId('\u0000trap', usedStateIds(graph))
  const next = (q: StateId, a: string): StateId =>
    q === TRAP ? TRAP : (delta.get(q)?.get(a) ?? TRAP)

  // 1. Erreichbare Zustände
  const reachable = [start.id]
  for (let i = 0; i < reachable.length; i++) {
    for (const a of alphabet) {
      const target = next(reachable[i], a)
      if (target !== TRAP && !reachable.includes(target)) reachable.push(target)
    }
  }
  const finals = new Set(graph.states.filter((s) => s.isFinal).map((s) => s.id))
  const all = [...reachable, TRAP]

  // 2. + 3. Klassen verfeinern
  let classOf = new Map(all.map((q) => [q, finals.has(q) ? 1 : 0]))
  let classCount = new Set(classOf.values()).size
  for (;;) {
    const ids = new Map<string, number>()
    const refined = new Map<StateId, number>()
    for (const q of all) {
      const signature = [classOf.get(q), ...alphabet.map((a) => classOf.get(next(q, a)))].join(',')
      if (!ids.has(signature)) ids.set(signature, ids.size)
      refined.set(q, ids.get(signature) as number)
    }
    classOf = refined
    if (ids.size === classCount) break
    classCount = ids.size
  }

  // 4. Klassen → Zustände (ohne die Klasse des Fangzustands)
  const trapClass = classOf.get(TRAP)
  const labelOf = new Map(graph.states.map((s) => [s.id, s.label]))
  const members = new Map<number, StateId[]>()
  for (const q of reachable) {
    const c = classOf.get(q) as number
    if (c === trapClass && q !== start.id) continue
    members.set(c, [...(members.get(c) ?? []), q])
  }

  const idOfClass = new Map<number, StateId>()
  const states: StateNode[] = [...members].map(([c, qs]) => {
    const id = createId('s')
    idOfClass.set(c, id)
    return {
      id,
      label: qs.map((q) => labelOf.get(q) ?? '?').join('/'),
      x: 0,
      y: 0,
      isStart: qs.includes(start.id),
      isFinal: finals.has(qs[0])
    }
  })

  const edges = new Map<string, TransitionEdge>()
  for (const [c, qs] of members) {
    if (c === trapClass) continue // leere Sprache: nur der Startzustand, ohne Übergänge
    for (const a of alphabet) {
      const target = classOf.get(next(qs[0], a)) as number
      if (target === trapClass) continue
      const from = idOfClass.get(c) as StateId
      const to = idOfClass.get(target) as StateId
      const key = JSON.stringify([from, to])
      const edge = edges.get(key) ?? { id: createId('t'), from, to, labels: [] }
      edge.labels.push({ read: a })
      edges.set(key, edge)
    }
  }

  const minimized = { states, transitions: [...edges.values()] }
  return { ...document, type: 'DFA', graph: layoutByDepth(minimized) }
}

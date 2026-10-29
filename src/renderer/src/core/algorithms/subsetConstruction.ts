import { epsilonClosure, move, startState } from '@/core/automaton/nfa'
import { layoutByDepth } from './layout'
import {
  compareSymbols,
  createId,
  type AutomatonDocument,
  type EditorGraph,
  type StateId,
  type StateNode,
  type TransitionEdge,
  type TransitionLabel
} from '@/model/graph'

/** Schutz vor der exponentiellen Explosion (bis zu 2^n Teilmengen). */
export const MAX_DFA_STATES = 500

/**
 * Potenzmengenkonstruktion: NEA → gleichwertiger DEA.
 *
 * - Jeder DEA-Zustand steht für eine Menge von NEA-Zuständen, beschriftet z. B. „{q0,q1}“.
 * - Start = ε-Hülle({q0}); Folgezustand von S mit a = ε-Hülle(move(S, a)).
 * - Endzustand, wenn die Menge mindestens einen NEA-Endzustand enthält.
 * - Nur vom Start aus erreichbare Mengen werden angelegt. Die leere Menge ∅ wird weggelassen –
 *   fehlende Übergänge heißen beim DEA „hängen“ = verwerfen (wie ein Fangzustand).
 *
 * Angeordnet wird mit layoutByDepth (Spalte = Abstand vom Start).
 */
export function nfaToDfa(document: AutomatonDocument): AutomatonDocument {
  const { graph, alphabet } = document
  const start = startState(graph)
  if (!start) throw new Error('Kein Startzustand – Umwandlung nicht möglich.')

  const labelOf = new Map(graph.states.map((s) => [s.id, s.label]))
  const finals = new Set(graph.states.filter((s) => s.isFinal).map((s) => s.id))

  /**
   * Gleiche Menge → gleicher Schlüssel, unabhängig von der Reihenfolge. Als JSON-Liste, damit
   * IDs mit Trennzeichen nicht verschmelzen: {„x|y“} ≠ {„x“, „y“}.
   */
  const keyOf = (set: Set<StateId>): string => JSON.stringify([...set].sort())
  const labelOfSet = (set: Set<StateId>): string =>
    `{${[...set]
      .map((id) => labelOf.get(id) ?? '?')
      .sort(compareSymbols)
      .join(',')}}`

  const states: StateNode[] = []
  const idOfKey = new Map<string, StateId>()
  /** Symbole pro Zustandspaar (from, to) – ein Übergang pro Paar wie im Editor */
  const edges = new Map<string, { from: StateId; to: StateId; labels: TransitionLabel[] }>()

  const addState = (set: Set<StateId>): StateId => {
    if (states.length >= MAX_DFA_STATES) {
      throw new Error(`Mehr als ${MAX_DFA_STATES} Zustände – Umwandlung abgebrochen.`)
    }
    const id = createId('s')
    states.push({
      id,
      label: labelOfSet(set),
      x: 0,
      y: 0,
      isStart: states.length === 0,
      isFinal: [...set].some((q) => finals.has(q))
    })
    idOfKey.set(keyOf(set), id)
    return id
  }

  const startSet = epsilonClosure(graph, [start.id]).states
  const queue: { set: Set<StateId>; id: StateId }[] = [{ set: startSet, id: addState(startSet) }]

  // Breitensuche über die erreichbaren Teilmengen
  for (let i = 0; i < queue.length; i++) {
    const { set, id } = queue[i]
    for (const symbol of alphabet) {
      const target = epsilonClosure(graph, move(graph, set, symbol).states).states
      if (target.size === 0) continue
      let targetId = idOfKey.get(keyOf(target))
      if (!targetId) {
        targetId = addState(target)
        queue.push({ set: target, id: targetId })
      }
      const edgeKey = JSON.stringify([id, targetId])
      const edge = edges.get(edgeKey) ?? { from: id, to: targetId, labels: [] }
      edge.labels.push({ read: symbol })
      edges.set(edgeKey, edge)
    }
  }

  const transitions: TransitionEdge[] = [...edges.values()].map((e) => ({ id: createId('t'), ...e }))
  const result: EditorGraph = { states, transitions }
  return { ...document, type: 'DFA', graph: layoutByDepth(result) }
}

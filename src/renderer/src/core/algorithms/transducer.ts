import { formatWord } from '@/core/automaton/labels'
import { startState } from '@/core/automaton/validation'
import {
  createId,
  createOutputSettings,
  findState,
  outputSettings,
  stateOutput,
  type AutomatonDocument,
  type StateId,
  type StateNode,
  type TransitionEdge,
  type TransitionLabel
} from '@/model/graph'
import { layoutByDepth } from './layout'

/** Schutz vor sehr vielen Zustandsvarianten (Zustand × verschiedene Ausgaben). */
export const MAX_MOORE_STATES = 500

/**
 * Moore → Mealy: Jede Regel gibt aus, was der Moore-Automat im Zielzustand ausgibt –
 * λ'(z, x) = λ(δ(z, x)). Zustände und Übergänge bleiben, wie sie sind.
 *
 * Die Ausgabe λ(z₀) des Startzustands vor dem ersten Zeichen kann ein Mealy-Automat nicht
 * erzeugen: Bis auf dieses erste Stück sind beide Ausgaben gleich.
 */
export function mooreToMealy(document: AutomatonDocument): AutomatonDocument {
  const { graph } = document
  const outputOf = (id: StateId): string[] => {
    const state = findState(graph, id)
    return state ? stateOutput(state) : []
  }
  return {
    type: 'MEALY',
    alphabet: document.alphabet,
    output: document.output ?? createOutputSettings(),
    graph: {
      states: graph.states.map(({ output: _, ...s }) => ({ ...s, isFinal: false })),
      transitions: graph.transitions.map((t) => ({
        ...t,
        labels: t.labels.map((l) => ({ read: l.read, output: outputOf(t.to) }))
      }))
    }
  }
}

/**
 * Mealy → Moore: Ein Moore-Zustand merkt sich, mit welcher Ausgabe man ihn betreten hat.
 *
 * - Zustände sind Paare (z, w): Mealy-Zustand z, betreten mit einer Regel, die w ausgibt.
 *   Moore gibt dort w aus – λ((z, w)) = w.
 * - Start = (z₀, ε): vor dem ersten Zeichen kommt keine Ausgabe dazu.
 * - Liest der Mealy-Automat in z das Zeichen x und gibt dabei v aus (Ziel z′), geht es von
 *   jedem (z, w) mit x nach (z′, v).
 * - Nur vom Start aus erreichbare Paare werden angelegt. Hat z nur eine Variante, behält sie den
 *   Namen, sonst heißen sie z_w (z. B. q1_0, q1_1, q0_ε).
 *
 * Beide Automaten übersetzen danach jedes Wort gleich. Angeordnet wird mit layoutByDepth.
 */
export function mealyToMoore(document: AutomatonDocument): AutomatonDocument {
  const { graph } = document
  const start = startState(graph)
  if (!start) throw new Error('Kein Startzustand – Umwandlung nicht möglich.')
  const delta = outputSettings(document).alphabet

  interface Pair {
    id: StateId
    state: StateNode
    output: string[]
  }
  const pairs: Pair[] = []
  const idOfKey = new Map<string, StateId>()
  /** Gleiches Paar → gleicher Schlüssel; als JSON, damit IDs mit Trennzeichen nicht verschmelzen */
  const keyOf = (state: StateId, output: string[]): string => JSON.stringify([state, output])
  const todo: Pair[] = []
  const pairOf = (state: StateNode, output: string[]): StateId => {
    const key = keyOf(state.id, output)
    const known = idOfKey.get(key)
    if (known) return known
    if (pairs.length >= MAX_MOORE_STATES) {
      throw new Error(`Mehr als ${MAX_MOORE_STATES} Zustände – Umwandlung abgebrochen.`)
    }
    const pair = { id: createId('s'), state, output }
    idOfKey.set(key, pair.id)
    pairs.push(pair)
    todo.push(pair)
    return pair.id
  }

  /** Regeln pro Paar von Moore-Zuständen – ein Übergang pro Paar wie im Editor */
  const edges = new Map<string, TransitionEdge>()
  const startId = pairOf(start, [])
  while (todo.length > 0) {
    const pair = todo.shift() as Pair
    for (const t of graph.transitions) {
      const target = t.from === pair.state.id ? findState(graph, t.to) : undefined
      if (!target) continue
      for (const label of t.labels) {
        const to = pairOf(target, label.output ?? [])
        const key = JSON.stringify([pair.id, to])
        const edge = edges.get(key) ?? { id: createId('t'), from: pair.id, to, labels: [] }
        const rule: TransitionLabel = { read: label.read }
        if (!edge.labels.some((l) => l.read === rule.read)) edge.labels.push(rule)
        edges.set(key, edge)
      }
    }
  }

  const variants = (state: StateId): number => pairs.filter((p) => p.state.id === state).length
  const taken = new Set<string>()
  const uniqueName = (name: string): string => {
    let unique = name
    while (taken.has(unique)) unique += '′'
    taken.add(unique)
    return unique
  }
  const states: StateNode[] = pairs.map((pair) => ({
    id: pair.id,
    label: uniqueName(
      variants(pair.state.id) === 1
        ? pair.state.label
        : `${pair.state.label}_${formatWord(pair.output, delta).replace(/ /g, '')}`
    ),
    x: 0,
    y: 0,
    isStart: pair.id === startId,
    isFinal: false,
    output: pair.output
  }))
  return {
    type: 'MOORE',
    alphabet: document.alphabet,
    output: document.output ?? createOutputSettings(),
    graph: layoutByDepth({ states, transitions: [...edges.values()] })
  }
}

import { epsilonClosure, move } from '@/core/automaton/setSimulator'
import { startState } from '@/core/automaton/validation'
import {
  EPSILON,
  edgeSymbols,
  type AutomatonDocument,
  type EditorGraph,
  type StateId,
  type TransitionEdge
} from '@/model/graph'
import type { Regex } from './regex'

/** Ein (ε-)NEA in der Form, die für den Vergleich gebraucht wird. */
export interface Machine {
  graph: EditorGraph
  start: StateId | null
  finals: Set<StateId>
}

export function machineFromDocument(document: AutomatonDocument): Machine {
  const { graph } = document
  return {
    graph,
    start: startState(graph)?.id ?? null,
    finals: new Set(graph.states.filter((s) => s.isFinal).map((s) => s.id))
  }
}

/**
 * Thompson-Konstruktion: regulärer Ausdruck → ε-NEA.
 *
 * Jeder Teilausdruck wird ein Baustein mit genau einem Ein- und einem Ausgang:
 * Symbol = eine Kante, Vereinigung = neue Weiche mit ε zu beiden Bausteinen,
 * Verkettung = Ausgang des ersten mit ε an den Eingang des zweiten, Stern = Schleife mit ε.
 * Mehrere Kanten zwischen denselben Zuständen sind möglich (für den Editor: mergeParallelEdges).
 */
export function regexToMachine(regex: Regex): Machine {
  const states: EditorGraph['states'] = []
  const transitions: TransitionEdge[] = []
  const newState = (): StateId => {
    const id = `r${states.length}`
    states.push({ id, label: id, x: 0, y: 0, isStart: false, isFinal: false })
    return id
  }
  const edge = (from: StateId, to: StateId, s: string): void => {
    transitions.push({ id: `rt${transitions.length}`, from, to, labels: [{ read: s }] })
  }

  const build = (r: Regex): { start: StateId; end: StateId } => {
    // Verkettung braucht keine eigenen Zustände: die Bausteine werden direkt per ε verbunden.
    if (r.kind === 'concat') {
      const fragments = r.parts.map(build)
      fragments.slice(1).forEach((f, i) => edge(fragments[i].end, f.start, EPSILON))
      return { start: fragments[0].start, end: fragments[fragments.length - 1].end }
    }
    const start = newState()
    switch (r.kind) {
      case 'union': {
        const end = newState()
        for (const part of r.parts) {
          const f = build(part)
          edge(start, f.start, EPSILON)
          edge(f.end, end, EPSILON)
        }
        return { start, end }
      }
      case 'star': {
        const f = build(r.inner)
        const end = newState()
        edge(start, f.start, EPSILON)
        edge(f.end, f.start, EPSILON)
        edge(f.end, end, EPSILON)
        edge(start, end, EPSILON)
        return { start, end }
      }
      default: {
        const end = newState()
        if (r.kind === 'epsilon') edge(start, end, EPSILON)
        if (r.kind === 'symbol') edge(start, end, r.symbol)
        return { start, end }
      }
    }
  }

  const { start, end } = build(regex)
  return { graph: { states, transitions }, start, finals: new Set([end]) }
}

export interface Difference {
  /** Kürzestes Wort, das genau einer der beiden akzeptiert (als Symbolfolge) */
  word: string[]
  /** Wer das Wort akzeptiert: der erste oder der zweite */
  acceptedBy: 'first' | 'second'
}

/** Schutz vor riesigen Zustandsräumen (Mengen-Paare) */
const MAX_PAIRS = 50_000

/**
 * Vergleicht zwei Sprachen. `null` = gleich, sonst das kürzeste unterscheidende Wort.
 *
 * Beide Automaten laufen gleichzeitig über Zustandsmengen (wie bei der Potenzmengen-
 * konstruktion, nur zu zweit). Breitensuche über die Paare (S₁, S₂): Ist genau eine der
 * beiden Mengen akzeptierend, unterscheidet das bisher gelesene Wort die Sprachen.
 * Wegen der Breitensuche ist es automatisch ein kürzestes.
 */
export function findDifference(
  first: Machine,
  second: Machine,
  alphabet: string[]
): Difference | null {
  const closureOf = (m: Machine, states: Iterable<StateId>): Set<StateId> =>
    epsilonClosure(m.graph, states).states
  const accepts = (m: Machine, set: Set<StateId>): boolean =>
    [...set].some((q) => m.finals.has(q))
  // JSON statt Trennzeichen: IDs mit „,“ oder „|“ dürfen nicht zu einem Paar verschmelzen
  const keyOf = (a: Set<StateId>, b: Set<StateId>): string =>
    JSON.stringify([[...a].sort(), [...b].sort()])

  const startPair = {
    a: closureOf(first, first.start ? [first.start] : []),
    b: closureOf(second, second.start ? [second.start] : []),
    word: [] as string[]
  }
  const seen = new Set([keyOf(startPair.a, startPair.b)])
  const queue = [startPair]

  for (let i = 0; i < queue.length; i++) {
    const { a, b, word } = queue[i]
    const inA = accepts(first, a)
    if (inA !== accepts(second, b)) return { word, acceptedBy: inA ? 'first' : 'second' }
    for (const symbol of alphabet) {
      const nextA = closureOf(first, move(first.graph, a, symbol).states)
      const nextB = closureOf(second, move(second.graph, b, symbol).states)
      const key = keyOf(nextA, nextB)
      if (seen.has(key)) continue
      if (seen.size >= MAX_PAIRS) throw new Error('Automaten zu groß für den Vergleich')
      seen.add(key)
      queue.push({ a: nextA, b: nextB, word: [...word, symbol] })
    }
  }
  return null
}

/** Alle Symbole außer ε, die auf Übergängen vorkommen */
export function transitionSymbols(graph: EditorGraph): Set<string> {
  return new Set(graph.transitions.flatMap(edgeSymbols).filter((s) => s !== EPSILON))
}

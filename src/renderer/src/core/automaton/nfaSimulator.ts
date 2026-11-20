import { EPSILON, readsSymbol, type AutomatonDocument, type StateId, type TransitionEdge } from '@/model/graph'
import type { SimulationResult, SimulationStep, Simulator } from './types'
import { startState } from './validation'
import { joinWord, tokenizeWord } from './word'

/** Knoten im Suchbaum: Zustand und Anzahl gelesener Eingabesymbole */
interface RunNode {
  state: StateId
  position: number
  /** Woher der Knoten kommt – `null` beim Start */
  parent: RunNode | null
  /** Benutzter Übergang und gelesenes Symbol (ε bei ε-Schritten) – `null` beim Start */
  edge: TransitionEdge | null
  symbol: string | null
}

export interface NfaSearch {
  /** Angezeigter Lauf vom Start bis zur letzten Konfiguration */
  path: RunNode[]
  accepted: boolean
}

/** Übergänge je Ausgangszustand: erst Schleifen, dann die übrigen in der Reihenfolge des Graphen */
function orderedOutgoing(document: AutomatonDocument): Map<StateId, TransitionEdge[]> {
  const result = new Map<StateId, TransitionEdge[]>()
  for (const t of document.graph.transitions) {
    const list = result.get(t.from)
    if (list) list.push(t)
    else result.set(t.from, [t])
  }
  for (const [state, list] of result) {
    result.set(state, [
      ...list.filter((t) => t.to === state),
      ...list.filter((t) => t.to !== state)
    ])
  }
  return result
}

function pathTo(node: RunNode): RunNode[] {
  const path: RunNode[] = []
  for (let n: RunNode | null = node; n; n = n.parent) path.push(n)
  return path.reverse()
}

/**
 * Tiefensuche nach einem akzeptierenden Lauf des NEA (iterativ, kein Rekursionsstack).
 *
 * Probiert wird „erst Schleifen, dann weitergehen“: in jedem Zustand zuerst die Selbstschleifen,
 * danach die übrigen Übergänge in der Reihenfolge des Graphen. Sackgassen führen zurück zur
 * letzten Wahl (Backtracking). Jeder Knoten (Zustand, Position) wird höchstens einmal betreten:
 * Wer schon untersucht wurde, führt nicht zum Ziel (sonst wäre die Suche beendet) – das hält die
 * Suche polynomiell und beendet sie auch bei ε-Zyklen.
 *
 * Akzeptiert: ganzes Wort gelesen und Endzustand (danach dürfen noch ε-Schritte folgen).
 * Verworfen: Angezeigt wird der Lauf, der am weitesten liest (bei Gleichstand der zuerst gefundene).
 */
export function searchNfa(document: AutomatonDocument, tokens: string[]): NfaSearch {
  const { graph } = document
  const finals = new Set(graph.states.filter((s) => s.isFinal).map((s) => s.id))
  const outgoing = orderedOutgoing(document)
  const start = startState(graph)
  if (!start) return { path: [], accepted: false }

  const root: RunNode = { state: start.id, position: 0, parent: null, edge: null, symbol: null }
  const visited = new Map<StateId, Set<number>>([[start.id, new Set([0])]])
  /** Neu betreten? Dann als besucht merken. */
  const enter = (state: StateId, position: number): boolean => {
    let seen = visited.get(state)
    if (!seen) visited.set(state, (seen = new Set()))
    if (seen.has(position)) return false
    seen.add(position)
    return true
  }

  let best = root
  if (root.position === tokens.length && finals.has(root.state)) {
    return { path: [root], accepted: true }
  }
  // Pro Ebene des Pfades: Knoten und Index des nächsten zu probierenden Übergangs
  const stack: { node: RunNode; edges: TransitionEdge[]; next: number; epsilon: boolean }[] = [
    { node: root, edges: outgoing.get(root.state) ?? [], next: 0, epsilon: false }
  ]
  while (stack.length > 0) {
    const frame = stack[stack.length - 1]
    if (frame.next >= frame.edges.length) {
      stack.pop()
      continue
    }
    const edge = frame.edges[frame.next]
    const { node } = frame
    // Je Übergang erst das Lesen des nächsten Symbols, dann der ε-Schritt
    let symbol: string | null = null
    if (!frame.epsilon) {
      frame.epsilon = true
      const token = tokens[node.position]
      // Ein „ε“ im Wort liegt nie in Σ: kein Übergang liest es
      if (token !== undefined && token !== EPSILON && readsSymbol(edge, token)) symbol = token
    } else {
      frame.epsilon = false
      frame.next += 1
      // Eine ε-Selbstschleife ändert nichts
      if (edge.to !== node.state && readsSymbol(edge, EPSILON)) symbol = EPSILON
    }
    if (symbol === null) continue
    const position = symbol === EPSILON ? node.position : node.position + 1
    if (!enter(edge.to, position)) continue
    const child: RunNode = { state: edge.to, position, parent: node, edge, symbol }
    if (position > best.position) best = child
    if (position === tokens.length && finals.has(child.state)) {
      return { path: pathTo(child), accepted: true }
    }
    stack.push({ node: child, edges: outgoing.get(child.state) ?? [], next: 0, epsilon: false })
  }
  return { path: pathTo(best), accepted: false }
}

/**
 * Simulation des NEA: ein konkreter Lauf durch die Originalzustände, keine Zustandsmengen.
 *
 * Der Lauf wird vorab gesucht (`searchNfa`), jeder Schritt wendet genau einen Übergang an –
 * auch ε-Übergänge, die nichts lesen. Angezeigt wird ein Zustand pro Schritt und der benutzte
 * Übergang.
 */
export class NfaSimulator implements Simulator {
  private readonly tokens: string[]
  private readonly alphabet: string[]
  private readonly search: NfaSearch
  private position = 0

  constructor(
    document: AutomatonDocument,
    readonly word: string
  ) {
    this.alphabet = document.alphabet
    this.tokens = tokenizeWord(word, document.alphabet)
    this.search = searchNfa(document, this.tokens)
  }

  get isFinished(): boolean {
    return this.position >= this.search.path.length - 1
  }

  get accepted(): boolean | null {
    return this.isFinished ? this.search.accepted : null
  }

  reset(): SimulationStep {
    this.position = 0
    return this.snapshot()
  }

  step(): SimulationStep {
    if (!this.isFinished) this.position += 1
    return this.snapshot()
  }

  run(maxSteps = Infinity): SimulationResult {
    const steps: SimulationStep[] = []
    while (!this.isFinished && steps.length < maxSteps) steps.push(this.step())
    return { accepted: this.accepted ?? false, steps }
  }

  /** Gelesener Teil und Rest entstehen erst beim Lesen – jeder Schritt bleibt klein. */
  private snapshot(): SimulationStep {
    const node = this.search.path[this.position]
    const { tokens, alphabet } = this
    return {
      index: this.position,
      activeStateIds: node ? [node.state] : [],
      usedTransitionIds: node?.edge ? [node.edge.id] : [],
      get consumed() {
        return joinWord(tokens.slice(0, node?.position ?? 0), alphabet)
      },
      get remaining() {
        return joinWord(tokens.slice(node?.position ?? 0), alphabet)
      },
      symbol: node?.symbol ?? null,
      inputPosition: node?.position ?? 0,
      ...(node?.symbol ? { label: { read: node.symbol } } : {})
    }
  }
}

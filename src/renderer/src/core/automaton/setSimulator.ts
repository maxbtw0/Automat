import {
  EPSILON,
  readsSymbol,
  type AutomatonDocument,
  type EditorGraph,
  type StateId,
  type TransitionEdge,
  type TransitionId
} from '@/model/graph'
import type { SimulationResult, SimulationStep, Simulator } from './types'
import { startState } from './validation'
import { tokenizeWord } from './word'

export interface StateSetResult {
  states: Set<StateId>
  /** Dabei benutzte Übergänge – für die Hervorhebung im Canvas */
  transitionIds: TransitionId[]
}

/** ε-Hülle: alle Zustände, die von `states` aus nur über ε-Übergänge erreichbar sind (inkl. selbst). */
export function epsilonClosure(graph: EditorGraph, states: Iterable<StateId>): StateSetResult {
  const result = new Set(states)
  const used: TransitionId[] = []
  const todo = [...result]
  while (todo.length > 0) {
    const current = todo.pop() as StateId
    for (const t of graph.transitions) {
      if (t.from !== current || !readsSymbol(t, EPSILON)) continue
      used.push(t.id)
      if (!result.has(t.to)) {
        result.add(t.to)
        todo.push(t.to)
      }
    }
  }
  return { states: result, transitionIds: used }
}

/** Ein Leseschritt: alle Zustände, die von `states` mit `symbol` erreichbar sind (ohne ε-Hülle). */
export function move(graph: EditorGraph, states: Set<StateId>, symbol: string): StateSetResult {
  const result = new Set<StateId>()
  const used: TransitionId[] = []
  // ε ist kein Eingabesymbol – ε-Übergänge lesen nichts
  if (symbol === EPSILON) return { states: result, transitionIds: used }
  for (const t of graph.transitions) {
    if (states.has(t.from) && readsSymbol(t, symbol)) {
      result.add(t.to)
      used.push(t.id)
    }
  }
  return { states: result, transitionIds: used }
}

/** Eine Schicht des vorausberechneten Laufs: Zustandsmenge nach i gelesenen Symbolen */
interface Layer {
  states: Set<StateId>
  /** Übergänge mit dem i-ten Symbol, die in diese Schicht führen (Schicht 0: keine) */
  moves: TransitionEdge[]
  /** ε-Übergänge innerhalb der Schicht (ε-Hülle) */
  epsilons: TransitionEdge[]
}

/**
 * Simulation über eine Menge aktiver Zustände – für NEA und DEA.
 *
 * Beim DEA enthält die Menge höchstens einen Zustand und ε-Übergänge werden nicht verfolgt.
 * Fertig ist die Simulation, wenn das Wort gelesen ist oder kein Zustand mehr aktiv ist
 * (der Automat „hängt“). Akzeptiert wird, wenn das ganze Wort gelesen wurde und ein aktiver
 * Zustand ein Endzustand ist.
 *
 * Angezeigt werden nur die Zweige, die wirklich etwas beitragen: Der ganze Lauf wird vorab
 * berechnet und dann rückwärts ausgedünnt. Akzeptiert → nur Zustände/Übergänge auf einem
 * akzeptierenden Pfad. Verworfen → nur die Zweige, die am weitesten kommen. Zweige, die
 * unterwegs aussterben, werden nicht hervorgehoben.
 */
export class StateSetSimulator implements Simulator {
  private readonly tokens: string[]
  private readonly layers: Layer[]
  /** Ausgedünnte Zustände und Übergänge pro Schicht – das, was angezeigt wird */
  private readonly shown: { stateIds: StateId[]; transitionIds: TransitionId[] }[]
  private readonly finals: Set<StateId>
  private position = 0

  constructor(
    private readonly document: AutomatonDocument,
    readonly word: string,
    private readonly options: { epsilon: boolean }
  ) {
    this.tokens = tokenizeWord(word, document.alphabet)
    this.finals = new Set(document.graph.states.filter((s) => s.isFinal).map((s) => s.id))
    this.layers = this.computeLayers()
    this.shown = this.prune()
  }

  get isFinished(): boolean {
    return this.position >= this.tokens.length || this.layers[this.position].states.size === 0
  }

  get accepted(): boolean | null {
    if (!this.isFinished) return null
    const states = this.layers[this.position].states
    return this.position >= this.tokens.length && [...states].some((id) => this.finals.has(id))
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

  /**
   * Vorwärts: Zustandsmengen nach 0, 1, 2 … gelesenen Symbolen – bis das Wort zu Ende ist
   * oder keine Zustände mehr aktiv sind.
   */
  private computeLayers(): Layer[] {
    const { graph } = this.document
    const epsilonsFrom = (states: Set<StateId>): TransitionEdge[] =>
      this.options.epsilon
        ? graph.transitions.filter((t) => states.has(t.from) && readsSymbol(t, EPSILON))
        : []
    const closure = (states: Iterable<StateId>): Set<StateId> =>
      this.options.epsilon ? epsilonClosure(graph, states).states : new Set(states)

    const start = startState(graph)
    const first = closure(start ? [start.id] : [])
    const layers: Layer[] = [{ states: first, moves: [], epsilons: epsilonsFrom(first) }]
    for (const symbol of this.tokens) {
      const previous = layers[layers.length - 1].states
      if (previous.size === 0) break
      // Ein „ε“ im Wort liegt nie in Σ: kein Übergang liest es, auch kein ε-Übergang
      const moves = graph.transitions.filter(
        (t) => symbol !== EPSILON && previous.has(t.from) && readsSymbol(t, symbol)
      )
      const states = closure(moves.map((t) => t.to))
      layers.push({ states, moves, epsilons: epsilonsFrom(states) })
    }
    return layers
  }

  /** Rückwärts: nur behalten, was zum Ziel der letzten Schicht beiträgt. */
  private prune(): { stateIds: StateId[]; transitionIds: TransitionId[] }[] {
    const { layers } = this
    // Ziel: akzeptierende Zustände – sonst alles in der letzten nicht leeren Schicht
    let last = layers.length - 1
    if (layers[last].states.size === 0 && last > 0) last -= 1
    const accepting = [...layers[last].states].filter((q) => this.finals.has(q))
    const wordRead = last === this.tokens.length
    let targets = new Set(wordRead && accepting.length > 0 ? accepting : layers[last].states)

    const useful: Set<StateId>[] = layers.map(() => new Set())
    for (let i = last; i >= 0; i--) {
      // Wer per ε einen nützlichen Zustand erreicht, ist selbst nützlich
      const set = new Set(targets)
      for (let changed = true; changed; ) {
        changed = false
        for (const t of layers[i].epsilons) {
          if (set.has(t.to) && !set.has(t.from)) {
            set.add(t.from)
            changed = true
          }
        }
      }
      useful[i] = set
      // Ziele der Schicht davor: Ausgangszustände der Leseschritte in nützliche Zustände
      targets = new Set(layers[i].moves.filter((t) => set.has(t.to)).map((t) => t.from))
    }

    return layers.map((layer, i) => ({
      stateIds: [...layer.states].filter((q) => useful[i].has(q)),
      transitionIds: [
        ...layer.moves.filter((t) => useful[i - 1]?.has(t.from) && useful[i].has(t.to)),
        ...layer.epsilons.filter((t) => useful[i].has(t.from) && useful[i].has(t.to))
      ].map((t) => t.id)
    }))
  }

  private snapshot(): SimulationStep {
    const { stateIds, transitionIds } = this.shown[this.position]
    return {
      index: this.position,
      activeStateIds: stateIds,
      usedTransitionIds: transitionIds,
      consumed: this.tokens.slice(0, this.position).join(''),
      remaining: this.tokens.slice(this.position).join(''),
      symbol: this.position > 0 ? this.tokens[this.position - 1] : null,
      inputPosition: this.position
    }
  }
}

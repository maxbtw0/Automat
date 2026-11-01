import {
  findState,
  outputsOnStates,
  stateOutput,
  type AutomatonDocument,
  type EditorGraph,
  type StateId,
  type TransitionEdge,
  type TransitionLabel
} from '@/model/graph'
import type { SimulationResult, SimulationStep, Simulator } from './types'
import { startState } from './validation'
import { tokenizeWord } from './word'

/** Die Regel, mit der der Zustand das Symbol liest – bei einem gültigen Transduktor höchstens eine. */
function findRule(
  graph: EditorGraph,
  from: StateId,
  symbol: string
): { edge: TransitionEdge; label: TransitionLabel } | null {
  for (const edge of graph.transitions) {
    if (edge.from !== from) continue
    const label = edge.labels.find((l) => l.read === symbol)
    if (label) return { edge, label }
  }
  return null
}

/**
 * Simulation eines Transduktors (Mealy oder Moore). Deterministisch: Pro gelesenem Symbol genau
 * ein Schritt, jeder Schritt hängt ein Stück an die Ausgabe – Mealy die Ausgabe der Regel,
 * Moore die Ausgabe des neuen Zustands. Moore gibt schon vor dem ersten Zeichen λ(z₀) aus.
 *
 * Der Lauf ist kurz (ein Schritt pro Zeichen) und wird vorab berechnet. Fertig übersetzt ist das
 * Wort, wenn alle Zeichen gelesen sind (`accepted`); fehlt unterwegs ein Übergang, bricht der
 * Lauf ab (`abortReason`) und die Ausgabe bis dahin bleibt stehen.
 */
export class TransducerSimulator implements Simulator {
  private readonly steps: SimulationStep[] = []
  private readonly complete: boolean
  readonly abortReason: string | null = null
  private position = 0

  constructor(
    document: AutomatonDocument,
    readonly word: string
  ) {
    const { graph } = document
    const tokens = tokenizeWord(word, document.alphabet)
    const moore = outputsOnStates(document.type)
    const snapshot = (
      read: number,
      state: StateId | null,
      output: string[][],
      edge?: TransitionEdge,
      label?: TransitionLabel
    ): SimulationStep => ({
      index: read,
      activeStateIds: state === null ? [] : [state],
      usedTransitionIds: edge ? [edge.id] : [],
      consumed: tokens.slice(0, read).join(''),
      remaining: tokens.slice(read).join(''),
      symbol: read > 0 ? tokens[read - 1] : null,
      inputPosition: read,
      output,
      // Moore: die Regel liest nur – was ausgegeben wird, steht am Zustand
      ...(label && !moore ? { label } : {})
    })

    const start = startState(graph)
    if (!start) {
      this.steps.push(snapshot(0, null, [[]]))
      this.abortReason = 'Kein Startzustand'
      this.complete = false
      return
    }
    let state = start
    let output = [moore ? stateOutput(start) : []]
    this.steps.push(snapshot(0, state.id, output))
    for (const [i, symbol] of tokens.entries()) {
      const rule = findRule(graph, state.id, symbol)
      const next = rule && findState(graph, rule.edge.to)
      if (!rule || !next) {
        this.abortReason = `Kein Übergang von ${state.label} mit „${symbol}“`
        break
      }
      state = next
      output = [...output, moore ? stateOutput(next) : (rule.label.output ?? [])]
      this.steps.push(snapshot(i + 1, state.id, output, rule.edge, rule.label))
    }
    this.complete = this.abortReason === null
  }

  get isFinished(): boolean {
    return this.position >= this.steps.length - 1
  }

  /** Wort ganz übersetzt? `null`, solange der Lauf noch nicht am Ende ist. */
  get accepted(): boolean | null {
    return this.isFinished ? this.complete : null
  }

  /** Ausgabe bis zur aktuellen Konfiguration als Symbolfolge */
  get output(): string[] {
    return (this.steps[this.position].output ?? []).flat()
  }

  reset(): SimulationStep {
    this.position = 0
    return this.steps[0]
  }

  step(): SimulationStep {
    if (!this.isFinished) this.position += 1
    return this.steps[this.position]
  }

  run(maxSteps = Infinity): SimulationResult {
    const steps: SimulationStep[] = []
    while (!this.isFinished && steps.length < maxSteps) steps.push(this.step())
    return { accepted: this.accepted ?? false, steps }
  }
}

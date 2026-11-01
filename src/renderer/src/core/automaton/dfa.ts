import type { AutomatonDocument } from '@/model/graph'
import { StateSetSimulator } from './setSimulator'
import type { Automaton, Simulator, ValidationIssue } from './types'
import {
  checkAlphabets,
  checkCompleteness,
  checkDeterminism,
  checkFinal,
  checkReachability,
  checkStart,
  checkSymbols
} from './validation'

/**
 * Deterministischer endlicher Automat (DEA) als Akzeptor.
 *
 *   A = (Q, Σ, δ, q0, F)   mit   δ: Q × Σ → Q
 *
 *   Q  = document.graph.states
 *   Σ  = document.alphabet
 *   δ  = document.graph.transitions   (ein Übergang kann mehrere Symbole tragen)
 *   q0 = der Zustand mit isStart
 *   F  = alle Zustände mit isFinal
 *
 * δ darf partiell sein: Fehlt δ(q, a), „hängt“ der Automat und verwirft das Wort
 * (gleichbedeutend mit einem unsichtbaren Fangzustand). Das meldet validate() als Warnung.
 */
export class DFA implements Automaton {
  readonly type = 'DFA' as const

  constructor(readonly document: AutomatonDocument) {}

  validate(): ValidationIssue[] {
    const { graph } = this.document
    return [
      ...checkStart(graph),
      ...checkAlphabets(this.document),
      ...checkSymbols(this.document, { allowEpsilon: false }),
      ...checkDeterminism(graph),
      ...checkCompleteness(this.document),
      ...checkFinal(graph),
      ...checkReachability(graph)
    ]
  }

  accepts(word: string): boolean {
    return this.createSimulator(word).run().accepted
  }

  /** Ein gültiger DEA ist ein NEA mit höchstens einem aktiven Zustand und ohne ε. */
  createSimulator(word: string): Simulator {
    return new StateSetSimulator(this.document, word, { epsilon: false })
  }
}

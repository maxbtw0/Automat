import { EPSILON, edgeSymbols, type AutomatonDocument, type TransitionId } from '@/model/graph'
import { StateSetSimulator } from './setSimulator'
import type { Automaton, Simulator, ValidationIssue } from './types'
import { checkFinal, checkReachability, checkStart, checkSymbols } from './validation'

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
      ...checkSymbols(this.document, { allowEpsilon: false }),
      ...this.checkDeterminism(),
      ...this.checkCompleteness(),
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

  /** Pro (Zustand, Symbol) höchstens ein Folgezustand. */
  private checkDeterminism(): ValidationIssue[] {
    const { graph } = this.document
    const issues: ValidationIssue[] = []
    for (const state of graph.states) {
      const bySymbol = new Map<string, TransitionId[]>()
      for (const t of graph.transitions) {
        if (t.from !== state.id) continue
        for (const symbol of edgeSymbols(t)) {
          if (symbol === EPSILON) continue // meldet schon checkSymbols
          bySymbol.set(symbol, [...(bySymbol.get(symbol) ?? []), t.id])
        }
      }
      for (const [symbol, transitionIds] of bySymbol) {
        if (transitionIds.length < 2) continue
        issues.push({
          severity: 'error',
          message: `Nicht deterministisch: ${state.label} mit „${symbol}“`,
          stateIds: [state.id],
          transitionIds
        })
      }
    }
    return issues
  }

  /** Pro (Zustand, Symbol) mindestens ein Folgezustand – sonst Warnung. */
  private checkCompleteness(): ValidationIssue[] {
    const { graph, alphabet } = this.document
    const issues: ValidationIssue[] = []
    for (const state of graph.states) {
      const defined = new Set(
        graph.transitions.filter((t) => t.from === state.id).flatMap(edgeSymbols)
      )
      const missing = alphabet.filter((a) => !defined.has(a))
      if (missing.length === 0) continue
      issues.push({
        severity: 'warning',
        message: `Unvollständig: ${state.label} ohne ${missing.map((a) => `„${a}“`).join(', ')}`,
        stateIds: [state.id]
      })
    }
    return issues
  }
}

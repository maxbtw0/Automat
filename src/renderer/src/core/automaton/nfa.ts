import { EPSILON, edgeSymbols, type AutomatonDocument } from '@/model/graph'
import { NfaSimulator } from './nfaSimulator'
import type { Automaton, Simulator, ValidationIssue } from './types'
import {
  checkAlphabets,
  checkFinal,
  checkReachability,
  checkStart,
  checkSymbols
} from './validation'

export { epsilonClosure, move, type StateSetResult } from './setSimulator'
export { startState } from './validation'

/**
 * Nichtdeterministischer endlicher Automat (NEA) mit ε-Übergängen.
 *
 *   A = (Q, Σ, δ, q0, F)   mit   δ: Q × (Σ ∪ {ε}) → 𝒫(Q)
 *
 * Wo der NEA die Wahl hat, probiert die Simulation einen Weg nach dem anderen (erst Schleifen,
 * dann weiter, bei einer Sackgasse zurück). Akzeptiert wird, wenn ein Lauf das ganze Wort liest
 * und in einem Endzustand endet (`NfaSimulator`).
 */
export class NFA implements Automaton {
  readonly type = 'NFA' as const

  constructor(readonly document: AutomatonDocument) {}

  validate(): ValidationIssue[] {
    const { graph } = this.document
    return [
      ...checkStart(graph),
      ...checkAlphabets(this.document),
      ...checkSymbols(this.document, { allowEpsilon: true }),
      ...checkFinal(graph),
      ...checkReachability(graph)
    ]
  }

  accepts(word: string): boolean {
    return this.createSimulator(word).run().accepted
  }

  createSimulator(word: string): Simulator {
    return new NfaSimulator(this.document, word)
  }
}

/**
 * Ist der Automat schon deterministisch? Also: keine ε-Übergänge und pro (Zustand, Symbol)
 * höchstens ein Folgezustand. Dann ist er ohne Umwandlung auch ein gültiger DEA.
 */
export function isDeterministic(document: AutomatonDocument): boolean {
  const { transitions } = document.graph
  if (transitions.some((t) => edgeSymbols(t).includes(EPSILON))) return false
  const seen = new Set<string>()
  for (const t of transitions) {
    for (const symbol of edgeSymbols(t)) {
      // JSON statt „|“ als Trennzeichen: Zustand „x|a“ mit b ≠ Zustand „x“ mit „a|b“
      const key = JSON.stringify([t.from, symbol])
      if (seen.has(key)) return false
      seen.add(key)
    }
  }
  return true
}

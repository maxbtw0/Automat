import { EPSILON, edgeSymbols, type AutomatonDocument } from '@/model/graph'
import { StateSetSimulator } from './setSimulator'
import type { Automaton, Simulator, ValidationIssue } from './types'
import { checkFinal, checkReachability, checkStart, checkSymbols } from './validation'

export { epsilonClosure, move, type StateSetResult } from './setSimulator'
export { startState } from './validation'

/**
 * Nichtdeterministischer endlicher Automat (NEA) mit ε-Übergängen.
 *
 *   A = (Q, Σ, δ, q0, F)   mit   δ: Q × (Σ ∪ {ε}) → 𝒫(Q)
 *
 * Statt eines aktuellen Zustands gibt es eine Menge aktiver Zustände. Nach jedem Schritt
 * (und am Anfang) kommt die ε-Hülle dazu. Akzeptiert wird, wenn nach dem ganzen Wort
 * mindestens ein aktiver Zustand ein Endzustand ist.
 */
export class NFA implements Automaton {
  readonly type = 'NFA' as const

  constructor(readonly document: AutomatonDocument) {}

  validate(): ValidationIssue[] {
    const { graph } = this.document
    return [
      ...checkStart(graph),
      ...checkSymbols(this.document, { allowEpsilon: true }),
      ...checkFinal(graph),
      ...checkReachability(graph)
    ]
  }

  accepts(word: string): boolean {
    return this.createSimulator(word).run().accepted
  }

  createSimulator(word: string): Simulator {
    return new StateSetSimulator(this.document, word, { epsilon: true })
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

import {
  EPSILON,
  stackSettings,
  type AutomatonDocument,
  type AutomatonType,
  type TransitionId
} from '@/model/graph'
import { UndecidedError } from './errors'
import { asPushdown, formatLabel, type PushdownLabel } from './labels'
import { PushdownSimulator } from './pdaSimulator'
import type { Automaton, Simulator, ValidationIssue } from './types'
import { checkAlphabets, checkFinal, checkReachability, checkStart } from './validation'

/**
 * Kellerautomat (KA, englisch PDA) als Akzeptor.
 *
 *   K = (Q, Σ, Γ, δ, q0, #, F)   mit   δ: Q × (Σ ∪ {ε}) × Γ → 𝒫(Q × Γ*)
 *
 *   Σ = document.alphabet,  Γ = document.stack.alphabet,  # = document.stack.start
 *   δ = Regeln „a, Z → AZ“ an den Übergängen: lies a, nimm Z vom Stack, lege AZ ab
 *
 * Jeder Schritt nimmt genau das oberste Symbol vom Stack (Top of Stack ∈ Γ, nie ε) – ε gibt es
 * nur bei der Eingabe. Ist der Stack leer, passt keine Regel mehr und der Automat hält.
 *
 * Konfiguration = (Zustand, Resteingabe, Stackinhalt). Akzeptiert wird je nach
 * `stack.acceptance`, wenn das Wort gelesen ist und der Automat in einem Endzustand ist bzw.
 * der Stack leer ist.
 *
 * Der deterministische Kellerautomat (DKA) hat in jeder Konfiguration höchstens eine passende
 * Regel – das prüft validate(). Simuliert wird beides gleich (Breitensuche, `PushdownSimulator`).
 */
export class PushdownAutomaton implements Automaton {
  constructor(
    readonly document: AutomatonDocument,
    private readonly deterministic: boolean
  ) {}

  get type(): AutomatonType {
    return this.document.type
  }

  validate(): ValidationIssue[] {
    const { graph } = this.document
    const { acceptance } = stackSettings(this.document)
    return [
      ...checkStart(graph),
      ...checkAlphabets(this.document),
      ...this.checkStackStart(),
      ...this.checkLabels(),
      ...(this.deterministic ? this.checkDeterminism() : []),
      // Bei Akzeptanz mit leerem Stack braucht es keine Endzustände
      ...(acceptance === 'final' ? checkFinal(graph) : []),
      ...checkReachability(graph)
    ]
  }

  /** Wirft `UndecidedError`, wenn der Lauf an einem Limit abbricht. */
  accepts(word: string): boolean {
    const simulator = this.createSimulator(word)
    const { accepted } = simulator.run()
    if (simulator.undecided) {
      throw new UndecidedError(word, simulator.abortReason ?? 'Limit erreicht')
    }
    return accepted
  }

  createSimulator(word: string): Simulator {
    return new PushdownSimulator(this.document, word)
  }

  private checkStackStart(): ValidationIssue[] {
    const { alphabet, start } = stackSettings(this.document)
    if (start === null) return [{ severity: 'error', message: 'Kein Stack-Startsymbol' }]
    if (alphabet.includes(start)) return []
    return [{ severity: 'error', message: `Stack-Startsymbol „${start}“ nicht in Γ` }]
  }

  /** Eingabe ∈ Σ ∪ {ε}, Top of Stack ∈ Γ (nie ε), Push ∈ Γ* (ohne ε); Übergänge ohne Regel. */
  private checkLabels(): ValidationIssue[] {
    const { alphabet } = this.document
    const gamma = stackSettings(this.document).alphabet
    const issues: ValidationIssue[] = []
    for (const t of this.document.graph.transitions) {
      if (t.labels.length === 0) {
        issues.push({ severity: 'warning', message: 'Übergang ohne Regel', transitionIds: [t.id] })
      }
      const messages = new Set<string>()
      for (const label of t.labels) {
        const { read, pop, push } = asPushdown(label)
        if (read !== EPSILON && !alphabet.includes(read)) {
          messages.add(`„${read}“ nicht im Alphabet`)
        }
        if (pop === EPSILON) messages.add('ε als Top of Stack nicht erlaubt')
        // Das leere Push-Wort ist [] – ein Element „ε“ läge sonst wirklich auf dem Stack
        if (push.includes(EPSILON)) messages.add('ε im Push-Wort nicht erlaubt')
        for (const symbol of [pop, ...push]) {
          if (symbol !== EPSILON && !gamma.includes(symbol)) {
            messages.add(`„${symbol}“ nicht im Stackalphabet`)
          }
        }
      }
      for (const message of messages) {
        issues.push({ severity: 'error', message, transitionIds: [t.id] })
      }
    }
    return issues
  }

  /**
   * DKA: Zwei Regeln desselben Zustands dürfen nie gleichzeitig passen. Sie passen gleichzeitig,
   * wenn sie dasselbe Top of Stack nehmen und die Eingabe gleich ist oder eine davon ε liest.
   */
  private checkDeterminism(): ValidationIssue[] {
    const { graph } = this.document
    const issues: ValidationIssue[] = []
    const readsOverlap = (a: string, b: string): boolean =>
      a === b || a === EPSILON || b === EPSILON
    for (const state of graph.states) {
      const rules: { label: PushdownLabel; transitionId: TransitionId }[] = graph.transitions
        .filter((t) => t.from === state.id)
        .flatMap((t) => t.labels.map((l) => ({ label: asPushdown(l), transitionId: t.id })))
      const reported = new Set<string>()
      for (let i = 0; i < rules.length; i++) {
        for (let j = i + 1; j < rules.length; j++) {
          const a = rules[i].label
          const b = rules[j].label
          if (a.pop !== b.pop || !readsOverlap(a.read, b.read)) continue
          const message = `Nicht deterministisch: ${state.label} mit „${formatLabel(a)}“ und „${formatLabel(b)}“`
          if (reported.has(message)) continue
          reported.add(message)
          issues.push({
            severity: 'error',
            message,
            stateIds: [state.id],
            transitionIds: [...new Set([rules[i].transitionId, rules[j].transitionId])]
          })
        }
      }
    }
    return issues
  }
}

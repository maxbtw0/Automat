import {
  TAPE_MOVES,
  tapeSettings,
  type AutomatonDocument,
  type AutomatonType,
  type TransitionId
} from '@/model/graph'
import { UndecidedError } from './errors'
import { asTuring } from './labels'
import { TuringSimulator } from './tmSimulator'
import type { Automaton, Simulator, ValidationIssue } from './types'
import { checkAlphabets, checkFinal, checkReachability, checkStart } from './validation'

/**
 * Deterministische Turingmaschine (TM) als Akzeptor.
 *
 *   M = (Q, Σ, Γ, δ, q0, #, F)   mit   δ: Q × Γ → Q × Γ × {L, R, N}   (partiell)
 *
 *   Σ = document.alphabet,  Γ = document.tape.alphabet ⊇ Σ ∪ {#},  # = document.tape.blank
 *   δ = Regeln „a → b, R“ an den Übergängen: lies a, schreibe b, Kopf nach rechts
 *
 * Konfiguration = (Zustand, Bandinhalt, Kopfposition), als Wort α q β. Die Maschine hält, wenn
 * keine Regel passt, und akzeptiert, wenn sie dabei in einem Endzustand ist.
 */
export class TuringMachine implements Automaton {
  constructor(readonly document: AutomatonDocument) {}

  get type(): AutomatonType {
    return this.document.type
  }

  validate(): ValidationIssue[] {
    const { graph } = this.document
    return [
      ...checkStart(graph),
      ...checkAlphabets(this.document),
      ...this.checkTape(),
      ...this.checkLabels(),
      ...this.checkDeterminism(),
      ...checkFinal(graph),
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
    return new TuringSimulator(this.document, word)
  }

  /** Blank ∈ Γ \ Σ und Σ ⊆ Γ */
  private checkTape(): ValidationIssue[] {
    const { alphabet, blank } = tapeSettings(this.document)
    const issues: ValidationIssue[] = []
    if (!alphabet.includes(blank)) {
      issues.push({ severity: 'error', message: `Blank „${blank}“ nicht im Bandalphabet` })
    }
    if (this.document.alphabet.includes(blank)) {
      issues.push({ severity: 'error', message: `Blank „${blank}“ darf nicht in Σ liegen` })
    }
    for (const symbol of this.document.alphabet) {
      if (!alphabet.includes(symbol)) {
        issues.push({ severity: 'error', message: `„${symbol}“ aus Σ fehlt im Bandalphabet` })
      }
    }
    return issues
  }

  /** Gelesene und geschriebene Symbole ∈ Γ, Bewegung L/R/N; Übergänge ohne Regel. */
  private checkLabels(): ValidationIssue[] {
    const gamma = tapeSettings(this.document).alphabet
    const issues: ValidationIssue[] = []
    for (const t of this.document.graph.transitions) {
      if (t.labels.length === 0) {
        issues.push({ severity: 'warning', message: 'Übergang ohne Regel', transitionIds: [t.id] })
      }
      const messages = new Set<string>()
      for (const label of t.labels) {
        const { read, write, move } = asTuring(label)
        for (const symbol of [read, write]) {
          if (!gamma.includes(symbol)) messages.add(`„${symbol}“ nicht im Bandalphabet`)
        }
        if (!TAPE_MOVES.includes(move)) messages.add(`Ungültige Bewegung „${move}“`)
      }
      for (const message of messages) {
        issues.push({ severity: 'error', message, transitionIds: [t.id] })
      }
    }
    return issues
  }

  /** Pro Zustand und Bandsymbol höchstens eine Regel. */
  private checkDeterminism(): ValidationIssue[] {
    const { graph } = this.document
    const issues: ValidationIssue[] = []
    for (const state of graph.states) {
      const byRead = new Map<string, TransitionId[]>()
      for (const t of graph.transitions.filter((t) => t.from === state.id)) {
        for (const label of t.labels) {
          byRead.set(label.read, [...(byRead.get(label.read) ?? []), t.id])
        }
      }
      for (const [read, transitionIds] of byRead) {
        if (transitionIds.length < 2) continue
        issues.push({
          severity: 'error',
          message: `Nicht deterministisch: ${state.label} liest „${read}“ mehrfach`,
          stateIds: [state.id],
          transitionIds: [...new Set(transitionIds)]
        })
      }
    }
    return issues
  }
}

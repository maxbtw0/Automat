import {
  outputSettings,
  outputsOnStates,
  stateOutput,
  type AutomatonDocument,
  type AutomatonType
} from '@/model/graph'
import { TransducerSimulator } from './transducerSimulator'
import type { Automaton, Simulator, ValidationIssue } from './types'
import {
  checkCompleteness,
  checkDeterminism,
  checkReachability,
  checkStart,
  checkSymbols
} from './validation'

/**
 * Transduktor (endlicher Automat mit Ausgabe) – Mealy oder Moore.
 *
 *   Mealy  A = (X, Y, Z, z0, δ, λ)   mit   δ: Z × X → Z,   λ: Z × X → Y*
 *   Moore  A = (X, Y, Z, z0, δ, λ)   mit   δ: Z × X → Z,   λ: Z → Y*
 *
 *   X = document.alphabet,  Y = document.output.alphabet (in der Oberfläche Δ)
 *   Mealy: λ an den Regeln „a/01“ (`TransitionLabel.output`)
 *   Moore: λ an den Zuständen „q0/1“ (`StateNode.output`), λ(z0) kommt vor dem ersten Zeichen
 *
 * Deterministisch wie der DEA, δ darf partiell sein (dann bricht die Übersetzung ab). Es gibt
 * keine Endzustände – das Ergebnis ist das Ausgabewort.
 */
export class Transducer implements Automaton {
  constructor(readonly document: AutomatonDocument) {}

  get type(): AutomatonType {
    return this.document.type
  }

  validate(): ValidationIssue[] {
    const { graph } = this.document
    return [
      ...checkStart(graph),
      ...checkSymbols(this.document, { allowEpsilon: false }),
      ...this.checkOutputs(),
      ...checkDeterminism(graph),
      ...checkCompleteness(this.document),
      ...checkReachability(graph)
    ]
  }

  /** „Akzeptiert“ = das ganze Wort wird übersetzt, ohne dass ein Übergang fehlt. */
  accepts(word: string): boolean {
    return this.translate(word) !== null
  }

  /** Ausgabewort zu `word` als Symbolfolge – `null`, wenn unterwegs ein Übergang fehlt. */
  translate(word: string): string[] | null {
    const simulator = new TransducerSimulator(this.document, word)
    simulator.run()
    return simulator.accepted ? simulator.output : null
  }

  createSimulator(word: string): Simulator {
    return new TransducerSimulator(this.document, word)
  }

  /** Ausgaben (Mealy an den Regeln, Moore an den Zuständen) ⊆ Δ* */
  private checkOutputs(): ValidationIssue[] {
    const delta = outputSettings(this.document).alphabet
    const unknown = (word: string[]): string[] => [...new Set(word.filter((s) => !delta.includes(s)))]
    const message = (symbol: string): string => `„${symbol}“ nicht im Ausgabealphabet`
    const { graph } = this.document
    if (outputsOnStates(this.document.type)) {
      return graph.states.flatMap((state) =>
        unknown(stateOutput(state)).map(
          (symbol): ValidationIssue => ({
            severity: 'error',
            message: message(symbol),
            stateIds: [state.id]
          })
        )
      )
    }
    return graph.transitions.flatMap((t) =>
      unknown(t.labels.flatMap((l) => l.output ?? [])).map(
        (symbol): ValidationIssue => ({
          severity: 'error',
          message: message(symbol),
          transitionIds: [t.id]
        })
      )
    )
  }
}

import type { AutomatonDocument } from '@/model/graph'
import {
  findDifference,
  machineFromDocument,
  regexToMachine,
  transitionSymbols
} from './equivalence'
import { regexSymbols, type Regex } from './regex'

export type RegexComparison =
  | { kind: 'equal' }
  | {
      kind: 'different'
      /** Kürzestes unterscheidendes Wort ('' = leeres Wort) */
      word: string
      acceptedBy: 'automaton' | 'regex'
    }

/** Beschreibt `regex` dieselbe Sprache wie der Automat? Sonst mit kürzestem Gegenbeispiel. */
export function compareRegexWithAutomaton(
  document: AutomatonDocument,
  regex: Regex
): RegexComparison {
  const automaton = machineFromDocument(document)
  if (!automaton.start) throw new Error('Kein Startzustand')
  const symbols = [
    ...document.alphabet,
    ...transitionSymbols(document.graph),
    ...regexSymbols(regex)
  ]
  const alphabet = [...new Set(symbols)]
  const difference = findDifference(automaton, regexToMachine(regex), alphabet)
  if (!difference) return { kind: 'equal' }
  return {
    kind: 'different',
    word: difference.word.join(''),
    acceptedBy: difference.acceptedBy === 'first' ? 'automaton' : 'regex'
  }
}

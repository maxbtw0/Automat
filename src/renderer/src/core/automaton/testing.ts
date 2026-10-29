import {
  createEmptyDocument,
  createStackSettings,
  createTapeSettings,
  symbolLabels,
  usesStack,
  usesTape,
  type AutomatonDocument,
  type AutomatonType,
  type StackSettings
} from '@/model/graph'
import { parseLabels } from './labels'

/**
 * Baut Testdokumente kompakt auf (nur für Tests):
 *
 *   buildDocument('NFA', ['a', 'b'], { start: 'q0', finals: ['q2'] }, [
 *     ['q0', 'a,b', 'q0'],
 *     ['q0', 'a', 'q1']
 *   ])
 *
 * Beim Kellerautomaten sind die Beschriftungen Stackregeln, mehrere mit Semikolon:
 *
 *   buildDocument('NPDA', ['a', 'b'], { start: 'q0', finals: ['q1'], stack: ['A', '#'] }, [
 *     ['q0', 'a, # → A#; a, A → AA', 'q0']
 *   ])
 *
 * Bei der Turingmaschine Bandregeln, Γ = Σ ∪ {#} plus `tape`:
 *
 *   buildDocument('TM', ['a'], { start: 'q0', finals: ['q1'], tape: ['X'] }, [
 *     ['q0', 'a → X, R', 'q0'],
 *     ['q0', '# → #, N', 'q1']
 *   ])
 *
 * Zustands-IDs = Bezeichnungen. Zustände werden aus Start, Endzuständen und Übergängen gesammelt.
 */
export function buildDocument(
  type: AutomatonType,
  alphabet: string[],
  {
    start,
    finals = [],
    states = [],
    stack,
    stackStart,
    acceptance,
    tape
  }: {
    start?: string
    finals?: string[]
    states?: string[]
    /** Stackalphabet Γ (Standard: {#}) */
    stack?: string[]
    stackStart?: string | null
    acceptance?: StackSettings['acceptance']
    /** Turingmaschine: weitere Bandsymbole außer Σ und # */
    tape?: string[]
  },
  transitions: [from: string, labels: string, to: string][]
): AutomatonDocument {
  const labels = new Set([
    ...(start ? [start] : []),
    ...states,
    ...finals,
    ...transitions.flatMap(([from, , to]) => [from, to])
  ])
  const doc = createEmptyDocument(type)
  doc.alphabet = alphabet
  if (usesStack(type)) {
    const defaults = createStackSettings()
    doc.stack = {
      alphabet: stack ?? defaults.alphabet,
      start: stackStart === undefined ? defaults.start : stackStart,
      acceptance: acceptance ?? defaults.acceptance
    }
  }
  if (usesTape(type)) doc.tape = createTapeSettings([...alphabet, ...(tape ?? [])])
  doc.graph.states = [...labels].map((label, i) => ({
    id: label,
    label,
    x: i * 100,
    y: 0,
    isStart: label === start,
    isFinal: finals.includes(label)
  }))
  doc.graph.transitions = transitions.map(([from, text, to], i) => ({
    id: `t${i}`,
    from,
    to,
    labels:
      usesStack(type) || usesTape(type)
        ? parsedLabels(text, doc)
        : symbolLabels(text.split(',').filter(Boolean))
  }))
  return doc
}

function parsedLabels(text: string, doc: AutomatonDocument) {
  const result = parseLabels(text, doc)
  if ('error' in result) throw new Error(result.error)
  return result.labels
}

/** Alle Wörter über `alphabet` bis zur Länge `maxLength` (inkl. leerem Wort). */
export function allWords(alphabet: string[], maxLength: number): string[] {
  let level = ['']
  const words = ['']
  for (let n = 1; n <= maxLength; n++) {
    level = level.flatMap((w) => alphabet.map((a) => w + a))
    words.push(...level)
  }
  return words
}

import { completeDfa } from '@/core/algorithms/complete'
import { layoutByDepth, relabelInOrder } from '@/core/algorithms/layout'
import { minimizeDfa } from '@/core/algorithms/minimize'
import { nfaToDfa } from '@/core/algorithms/subsetConstruction'
import {
  compareSymbols,
  createId,
  readsSymbol,
  type AutomatonDocument,
  type EditorGraph,
  type TransitionEdge
} from '@/model/graph'
import { regexToMachine } from './equivalence'
import { regexSymbols, type Regex } from './regex'

export type RegexAutomatonKind = 'dfa' | 'nfa'

/** Ein Übergang pro Zustandspaar (wie im Editor): parallele Kanten zusammenfassen. */
function mergeParallelEdges(graph: EditorGraph): EditorGraph {
  const merged = new Map<string, TransitionEdge>()
  for (const t of graph.transitions) {
    const key = JSON.stringify([t.from, t.to])
    const edge = merged.get(key) ?? { id: createId('t'), from: t.from, to: t.to, labels: [] }
    for (const label of t.labels) {
      if (!readsSymbol(edge, label.read)) edge.labels.push({ read: label.read })
    }
    merged.set(key, edge)
  }
  return { ...graph, transitions: [...merged.values()] }
}

/**
 * Baut einen Automaten für einen regulären Ausdruck.
 *
 * - `nfa`: ε-NEA nach Thompson (zeigt die Bausteine der Konstruktion)
 * - `dfa`: Thompson → Potenzmengenkonstruktion → Minimierung → Vervollständigen
 *   = minimaler vollständiger DEA (fehlende Übergänge führen in den Fangzustand „trap“)
 *
 * Σ = bisheriges Alphabet ∪ Symbole des Ausdrucks. Zustände heißen q0, q1, … in
 * Besuchsreihenfolge und sind in Spalten nach Abstand vom Start angeordnet.
 */
export function regexToDocument(
  regex: Regex,
  kind: RegexAutomatonKind,
  baseAlphabet: string[] = []
): AutomatonDocument {
  const alphabet = [...new Set([...baseAlphabet, ...regexSymbols(regex)])].sort(compareSymbols)
  const machine = regexToMachine(regex)
  const graph = mergeParallelEdges({
    states: machine.graph.states.map((s) => ({
      ...s,
      isStart: s.id === machine.start,
      isFinal: machine.finals.has(s.id)
    })),
    transitions: machine.graph.transitions
  })
  const nfa: AutomatonDocument = { type: 'NFA', alphabet, graph }
  if (kind === 'nfa') return { ...nfa, graph: relabelInOrder(layoutByDepth(nfa.graph)) }
  // Erst umbenennen (q0, q1, …), dann den Fangzustand „trap“ ergänzen, dann anordnen
  const minimal = minimizeDfa(nfaToDfa(nfa))
  const complete = completeDfa({ ...minimal, graph: relabelInOrder(minimal.graph) })
  return { ...complete, graph: layoutByDepth(complete.graph) }
}

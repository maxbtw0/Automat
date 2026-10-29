import {
  EPSILON,
  createId,
  edgeSymbols,
  nextStatePosition,
  symbolLabels,
  type AutomatonDocument,
  type StateId,
  type StateNode,
  type TransitionEdge
} from '@/model/graph'

/** Bezeichnung des Fangzustands (bei der Potenzmengenkonstruktion die leere Menge ∅) */
export const TRAP_LABEL = 'trap'

/**
 * Vervollständigen: Fehlt für einen Zustand ein Übergang mit einem Symbol aus Σ, führt er
 * in einen Fangzustand „trap“. Der Fangzustand ist kein Endzustand und hat für jedes Symbol eine
 * Schleife auf sich selbst – wer einmal drin ist, kommt nicht mehr heraus.
 *
 * Die Sprache bleibt gleich (fehlender Übergang = verwerfen), aber δ ist jetzt total, wie es
 * die formale Definition des DEA verlangt. Ist der DEA schon vollständig, ändert sich nichts.
 *
 * Gibt es schon einen Zustand, der nur ein Fangzustand sein kann – kein Endzustand, keine
 * Übergänge zu anderen Zuständen –, wird er zum Fangzustand, statt einen zweiten gleichwertigen
 * anzulegen. Wichtig nach der Minimierung: Bei der leeren Sprache bleibt dort nur der Start
 * ohne Übergänge, der minimale vollständige DEA ist dann genau dieser Zustand mit Schleife.
 * Ein neuer Fangzustand landet rechts neben dem bisher rechtesten Zustand.
 */
export function completeDfa(document: AutomatonDocument): AutomatonDocument {
  const { graph } = document
  const alphabet = [
    ...new Set([
      ...document.alphabet,
      ...graph.transitions.flatMap(edgeSymbols).filter((s) => s !== EPSILON)
    ])
  ]

  const missing = new Map<StateId, string[]>()
  for (const state of graph.states) {
    const defined = new Set(
      graph.transitions.filter((t) => t.from === state.id).flatMap(edgeSymbols)
    )
    const symbols = alphabet.filter((a) => !defined.has(a))
    if (symbols.length > 0) missing.set(state.id, symbols)
  }
  if (missing.size === 0) return document

  const existing = graph.states.find(
    (s) => !s.isFinal && graph.transitions.every((t) => t.from !== s.id || t.to === s.id)
  )
  const trap: StateNode = existing ?? {
    id: createId('s'),
    label: freeTrapLabel(graph.states),
    ...nextStatePosition(graph),
    isStart: false,
    isFinal: false
  }

  // Fehlende Symbole an eine schon vorhandene Kante zum Fangzustand hängen (ein Übergang pro
  // Zustandspaar), sonst eine neue Kante anlegen
  const transitions = graph.transitions.map((t) => {
    const symbols = t.to === trap.id ? missing.get(t.from) : undefined
    if (!symbols) return t
    missing.delete(t.from)
    return { ...t, labels: [...t.labels, ...symbolLabels(symbols)] }
  })
  const toTrap: TransitionEdge[] = [...missing].map(([from, symbols]) => ({
    id: createId('t'),
    from,
    to: trap.id,
    labels: symbolLabels(symbols)
  }))
  if (!existing) {
    toTrap.push({ id: createId('t'), from: trap.id, to: trap.id, labels: symbolLabels(alphabet) })
  }

  return {
    ...document,
    graph: {
      states: existing ? graph.states : [...graph.states, trap],
      transitions: [...transitions, ...toTrap]
    }
  }
}

/** „trap“, bei Namensgleichheit „trap1“, „trap2“, … */
function freeTrapLabel(states: StateNode[]): string {
  const used = new Set(states.map((s) => s.label))
  let label = TRAP_LABEL
  for (let i = 1; used.has(label); i++) label = `${TRAP_LABEL}${i}`
  return label
}

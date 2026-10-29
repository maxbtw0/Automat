import type { EditorGraph, StateId } from '@/model/graph'

/** Alle IDs, die im Graphen vorkommen – auch Enden von Übergängen ohne passenden Zustand. */
export function usedStateIds(graph: EditorGraph): Set<StateId> {
  return new Set([
    ...graph.states.map((s) => s.id),
    ...graph.transitions.flatMap((t) => [t.from, t.to])
  ])
}

/**
 * Hilfszustand für einen Algorithmus (unsichtbarer Fangzustand, neuer Start …), dessen ID mit
 * keiner vorhandenen zusammenfällt – auch nicht mit importierten IDs wie „\u0000trap“.
 * Die neue ID kommt mit in `used`.
 */
export function freshStateId(base: string, used: Set<StateId>): StateId {
  let id = base
  while (used.has(id)) id += '\u0000'
  used.add(id)
  return id
}

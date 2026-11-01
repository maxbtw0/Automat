import { freshStateId, usedStateIds } from '@/core/algorithms/ids'
import { startState } from '@/core/automaton/validation'
import { EPSILON, edgeSymbols, type AutomatonDocument, type StateId } from '@/model/graph'
import { concat, empty, epsilon, regexLength, star, symbol, union, type Regex } from './regex'

/**
 * Längster Ausdruck, den die Zustandselimination liefert (Zeichen, obere Schranke). Intern teilen
 * sich die Kanten ihre Teilausdrücke, ausgeschrieben wächst das Ergebnis aber exponentiell –
 * schon zehn Zustände mit allen Kanten ergeben fast eine Million Zeichen.
 */
export const MAX_REGEX_LENGTH = 100_000

/**
 * Zustandselimination: Automat (DEA oder NEA) → gleichwertiger regulärer Ausdruck.
 *
 * 1. Neuer Start S mit S –ε→ q0 und neues Ende F mit f –ε→ F für jeden Endzustand f.
 *    Kanten tragen ab jetzt reguläre Ausdrücke (mehrere Symbole = Vereinigung).
 * 2. Ein Zustand q nach dem anderen wird entfernt. Für jedes Paar p → q → r entsteht
 *    p –R(p,q) R(q,q)* R(q,r)→ r, vereinigt mit der bisherigen Kante p → r.
 * 3. Übrig bleibt S → F – deren Ausdruck beschreibt die Sprache des Automaten.
 *
 * 4. Ist das Ergebnis länger als `maxLength` Zeichen, gibt es einen Fehler statt des Ausdrucks.
 *
 * Die Reihenfolge beeinflusst nur die Form des Ergebnisses, nicht die Sprache. Zuerst wird
 * der Zustand mit den wenigsten Weg-Kombinationen (Eingänge × Ausgänge) entfernt – das hält
 * den Ausdruck meist kurz.
 */
export function automatonToRegex(
  document: AutomatonDocument,
  maxLength = MAX_REGEX_LENGTH
): Regex {
  const { graph } = document
  const start = startState(graph)
  if (!start) throw new Error('Kein Startzustand')
  // Neuer Start S und neues Ende F – mit IDs, die im Automaten sicher nicht vorkommen
  const used = usedStateIds(graph)
  const NEW_START = freshStateId('\u0000start', used)
  const NEW_FINAL = freshStateId('\u0000final', used)

  /** edges.get(p).get(r) = Ausdruck auf der Kante p → r */
  const edges = new Map<StateId, Map<StateId, Regex>>()
  /** into.get(r) = alle p mit einer Kante p → r (Index, damit niemand alle Kanten durchsucht) */
  const into = new Map<StateId, Set<StateId>>()
  const get = (p: StateId, r: StateId): Regex => edges.get(p)?.get(r) ?? empty
  const add = (p: StateId, r: StateId, regex: Regex): void => {
    const combined = union(get(p, r), regex)
    if (combined.kind === 'empty') return
    if (!edges.has(p)) edges.set(p, new Map())
    edges.get(p)?.set(r, combined)
    if (!into.has(r)) into.set(r, new Set())
    into.get(r)?.add(p)
  }

  add(NEW_START, start.id, epsilon)
  for (const s of graph.states) if (s.isFinal) add(s.id, NEW_FINAL, epsilon)
  for (const t of graph.transitions) {
    for (const a of edgeSymbols(t)) add(t.from, t.to, a === EPSILON ? epsilon : symbol(a))
  }

  const incoming = (q: StateId): StateId[] => [...(into.get(q) ?? [])].filter((p) => p !== q)
  const outgoing = (q: StateId): StateId[] =>
    [...(edges.get(q)?.keys() ?? [])].filter((r) => r !== q)
  /** Anzahl ohne Schleife, ohne Listen zu bauen */
  const degree = (set: { size: number; has(q: StateId): boolean } | undefined, q: StateId) =>
    set ? set.size - (set.has(q) ? 1 : 0) : 0

  const remaining = graph.states.map((s) => s.id)
  while (remaining.length > 0) {
    // Zustand mit den wenigsten Weg-Kombinationen zuerst
    let best = 0
    let bestCost = Infinity
    remaining.forEach((q, i) => {
      const cost = degree(into.get(q), q) * degree(edges.get(q), q)
      if (cost < bestCost) {
        best = i
        bestCost = cost
      }
    })
    const [q] = remaining.splice(best, 1)

    const loop = star(get(q, q))
    const ins = incoming(q)
    const outs = outgoing(q)
    for (const p of ins) {
      for (const r of outs) add(p, r, concat(get(p, q), loop, get(q, r)))
    }
    for (const p of ins) edges.get(p)?.delete(q)
    for (const r of outs) into.get(r)?.delete(q)
    edges.delete(q)
    into.delete(q)
  }

  const result = get(NEW_START, NEW_FINAL)
  if (regexLength(result) > maxLength) {
    throw new Error(`Ausdruck zu lang (über ${maxLength.toLocaleString('de-DE')} Zeichen)`)
  }
  return result
}

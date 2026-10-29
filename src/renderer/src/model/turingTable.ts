import {
  createId,
  type EditorGraph,
  type StateId,
  type TapeMove,
  type TransitionEdge,
  type TransitionLabel
} from './graph'

/**
 * Übergangstabelle der Turingmaschine als Matrix: Zeile = Zustand q, Spalte = Bandsymbol a,
 * Zelle = δ(q, a) = (p, b, R). Im Graph steht dieselbe Regel als `a → b, R` am Übergang q → p.
 * Die Turingmaschine ist deterministisch – pro Zelle gibt es höchstens eine Regel.
 */
export interface TuringCell {
  /** Folgezustand */
  to: StateId
  /** Geschriebenes Bandsymbol */
  write: string
  move: TapeMove
}

/** Inhalt der Zelle δ(from, read) – `null`, wenn die Maschine dort hält. */
export function turingCell(graph: EditorGraph, from: StateId, read: string): TuringCell | null {
  for (const t of graph.transitions) {
    if (t.from !== from) continue
    const label = t.labels.find((l) => l.read === read)
    if (label) return { to: t.to, write: label.write ?? read, move: label.move ?? 'N' }
  }
  return null
}

export function sameTuringCell(a: TuringCell | null, b: TuringCell | null): boolean {
  if (a === null || b === null) return a === b
  return a.to === b.to && a.write === b.write && a.move === b.move
}

/**
 * Setzt die Zelle δ(from, read) – `null` leert sie. Die Regel wandert dabei auf den Übergang
 * from → to (wird angelegt, falls es ihn noch nicht gibt); bleibt der Folgezustand gleich,
 * behält sie ihre Position. Übergänge, die dadurch keine Regel mehr haben, verschwinden.
 */
export function setTuringCell(
  graph: EditorGraph,
  from: StateId,
  read: string,
  cell: TuringCell | null
): EditorGraph {
  const label: TransitionLabel | null = cell && { read, write: cell.write, move: cell.move }
  const transitions = graph.transitions.flatMap((t): TransitionEdge[] => {
    if (t.from !== from) return [t]
    const has = t.labels.some((l) => l.read === read)
    if (label && t.to === cell?.to) {
      if (!has) return [{ ...t, labels: [...t.labels, label] }]
      // An der Stelle der ersten alten Regel ersetzen, weitere (nichtdeterministische) entfernen
      const first = t.labels.findIndex((l) => l.read === read)
      const labels = t.labels.flatMap((l, i) => (l.read !== read ? [l] : i === first ? [label] : []))
      return [{ ...t, labels }]
    }
    if (!has) return [t]
    const labels = t.labels.filter((l) => l.read !== read)
    return labels.length > 0 ? [{ ...t, labels }] : []
  })
  if (label && cell && !transitions.some((t) => t.from === from && t.to === cell.to)) {
    transitions.push({ id: createId('t'), from, to: cell.to, labels: [label] })
  }
  return { ...graph, transitions }
}

import { asPushdown } from '@/core/automaton/labels'
import {
  EPSILON,
  createStackSettings,
  createTapeSettings,
  symbolLabels,
  usesStack,
  usesTape,
  type AutomatonDocument,
  type AutomatonType,
  type TransitionLabel
} from '@/model/graph'

const mapLabels = (
  document: AutomatonDocument,
  map: (labels: TransitionLabel[]) => TransitionLabel[]
): AutomatonDocument['graph'] => ({
  ...document.graph,
  transitions: document.graph.transitions.map((t) => ({ ...t, labels: map(t.labels) }))
})

/** Ändert irgendeine Regel den Stack? `a, # → #` legt das Top of Stack nur zurück. */
export function hasStackOperations(document: AutomatonDocument): boolean {
  return document.graph.transitions.some((t) =>
    t.labels.some((l) => {
      const { pop, push } = asPushdown(l)
      return !(push.length === 1 && push[0] === pop)
    })
  )
}

/** Jede gelesene Eingabe als Stackregel, die das Top of Stack zurücklegt: `a, X → X` für X ∈ Γ */
const keepStackLabels = (reads: string[], stackAlphabet: string[]): TransitionLabel[] =>
  reads.flatMap((read) => stackAlphabet.map((pop) => ({ read, pop, push: [pop] })))

/** Hat die Turingmaschine Regeln? Beim Wechsel zu einem anderen Typ gehen Schreiben/Bewegung verloren. */
export function hasTapeOperations(document: AutomatonDocument): boolean {
  return usesTape(document.type) && document.graph.transitions.some((t) => t.labels.length > 0)
}

/** Gelesene Symbole ohne Duplikate – optional nur die aus `allowed` */
const readSymbols = (labels: TransitionLabel[], allowed?: string[]): string[] => [
  ...new Set(labels.map((l) => l.read).filter((r) => !allowed || allowed.includes(r)))
]

/**
 * Wechselt den Typ und passt die Regeln an:
 *
 * - endlicher Automat → Kellerautomat: `a` wird `a, # → #` (nimmt # und legt es zurück, der
 *   Stack bleibt also unverändert, die Sprache bei Akzeptanz mit Endzustand gleich), Γ = {#}.
 * - Kellerautomat → endlicher Automat: nur die gelesenen Symbole bleiben, Γ entfällt.
 * - → Turingmaschine: `a` wird `a → a, R` (lesen und weiterrücken), ε-Regeln entfallen,
 *   Bandalphabet Γ = Σ ∪ {#}.
 * - Turingmaschine → andere: nur gelesene Symbole aus Σ bleiben, das Bandalphabet entfällt.
 * - sonst (DEA ↔ NEA, DKA ↔ NKA) ändert sich nur der Typ.
 */
export function changeDocumentType(
  document: AutomatonDocument,
  type: AutomatonType
): AutomatonDocument {
  if (document.type === type) return document
  if (usesTape(type)) return toTuringMachine(document, type)
  if (usesTape(document.type)) return fromTuringMachine(document, type)
  const fromStack = usesStack(document.type)
  const toStack = usesStack(type)
  if (fromStack === toStack) return { ...document, type }

  if (toStack) {
    const stack = document.stack ?? createStackSettings()
    return {
      ...document,
      type,
      stack,
      graph: mapLabels(document, (labels) => keepStackLabels(readSymbols(labels), stack.alphabet))
    }
  }
  const { alphabet } = document
  return {
    type,
    alphabet,
    graph: mapLabels(document, (labels) => symbolLabels([...new Set(labels.map((l) => l.read))]))
  }
}

function toTuringMachine(document: AutomatonDocument, type: AutomatonType): AutomatonDocument {
  const { alphabet } = document
  return {
    type,
    alphabet,
    tape: createTapeSettings(alphabet),
    graph: mapLabels(document, (labels) =>
      readSymbols(labels.filter((l) => l.read !== EPSILON)).map((read) => ({
        read,
        write: read,
        move: 'R'
      }))
    )
  }
}

function fromTuringMachine(document: AutomatonDocument, type: AutomatonType): AutomatonDocument {
  const { alphabet } = document
  const stack = usesStack(type) ? createStackSettings() : undefined
  return {
    type,
    alphabet,
    ...(stack ? { stack } : {}),
    graph: mapLabels(document, (labels) => {
      const reads = readSymbols(labels, alphabet)
      return stack ? keepStackLabels(reads, stack.alphabet) : symbolLabels(reads)
    })
  }
}

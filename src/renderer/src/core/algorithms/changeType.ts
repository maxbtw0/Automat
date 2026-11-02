import { asPushdown } from '@/core/automaton/labels'
import {
  EPSILON,
  createOutputSettings,
  createStackSettings,
  createTapeSettings,
  outputsOnStates,
  stateOutput,
  symbolLabels,
  usesOutput,
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

/** Gibt der Transduktor irgendwo etwas aus? Beim Wechsel zu einem Akzeptor geht das verloren. */
export function hasOutputs(document: AutomatonDocument): boolean {
  if (!usesOutput(document.type)) return false
  if (outputsOnStates(document.type)) {
    return document.graph.states.some((s) => stateOutput(s).length > 0)
  }
  return document.graph.transitions.some((t) => t.labels.some((l) => (l.output ?? []).length > 0))
}

/**
 * Liest eine Regel ε? Turingmaschine und Transduktor lesen in jedem Schritt ein Symbol – beim
 * Wechsel dorthin entfallen diese Regeln.
 */
export function hasEpsilonRules(document: AutomatonDocument): boolean {
  return document.graph.transitions.some((t) => t.labels.some((l) => l.read === EPSILON))
}

/** Hat der Akzeptor Endzustände? Transduktoren haben keine. */
export function hasFinalStates(document: AutomatonDocument): boolean {
  return !usesOutput(document.type) && document.graph.states.some((s) => s.isFinal)
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
 * - → Transduktor: nur gelesene Symbole aus Σ bleiben (ohne ε), jede Regel gibt ε aus,
 *   Endzustände entfallen. Mealy ↔ Moore ohne Umwandlung: die Ausgaben entfallen.
 * - Transduktor → Akzeptor: die Ausgaben und Δ entfallen.
 * - sonst (DEA ↔ NEA, DKA ↔ NKA) ändert sich nur der Typ.
 */
export function changeDocumentType(
  document: AutomatonDocument,
  type: AutomatonType
): AutomatonDocument {
  if (document.type === type) return document
  if (usesOutput(type)) return toTransducer(document, type)
  if (usesOutput(document.type)) return changeDocumentType(withoutOutputs(document), type)
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

function toTransducer(document: AutomatonDocument, type: AutomatonType): AutomatonDocument {
  const { alphabet } = document
  const mealy = !outputsOnStates(type)
  return {
    type,
    alphabet,
    output: document.output ?? createOutputSettings(),
    graph: {
      states: document.graph.states.map(({ output: _, ...s }) => ({
        ...s,
        isFinal: false,
        ...(mealy ? {} : { output: [] })
      })),
      transitions: document.graph.transitions.map((t) => {
        const reads = readSymbols(t.labels, alphabet)
        const labels = mealy ? reads.map((read) => ({ read, output: [] })) : symbolLabels(reads)
        return { ...t, labels }
      })
    }
  }
}

/** Transduktor als DEA ohne Ausgaben – der weitere Typwechsel läuft dann wie beim DEA. */
function withoutOutputs(document: AutomatonDocument): AutomatonDocument {
  return {
    type: 'DFA',
    alphabet: document.alphabet,
    graph: {
      states: document.graph.states.map(({ output: _, ...s }) => s),
      transitions: document.graph.transitions.map((t) => ({
        ...t,
        labels: symbolLabels(readSymbols(t.labels))
      }))
    }
  }
}

import {
  changeDocumentType,
  hasFinalStates,
  hasOutputs,
  hasStackOperations,
  hasTapeOperations
} from '@/core/algorithms/changeType'
import { completeDfa } from '@/core/algorithms/complete'
import { layoutByDepth } from '@/core/algorithms/layout'
import { minimizeDfa } from '@/core/algorithms/minimize'
import { nfaToDfa } from '@/core/algorithms/subsetConstruction'
import { mealyToMoore, mooreToMealy } from '@/core/algorithms/transducer'
import { describeError } from '@/core/automaton/errors'
import { usesOutput, usesStack, type AutomatonDocument, type AutomatonType } from '@/model/graph'
import { askChoice } from '@/store/dialogStore'
import { useEditorStore } from '@/store/editorStore'

const CONVERT = 0
const SWITCH_ONLY = 1

/**
 * NEA → gleichwertiger minimaler, vollständiger DEA: Potenzmengenkonstruktion, Minimierung,
 * dann Vervollständigen (fehlende Übergänge → Fangzustand „trap“).
 */
export function convertNfaToMinimalDfa(document: AutomatonDocument): AutomatonDocument {
  const dfa = completeDfa(minimizeDfa(nfaToDfa(document)))
  return { ...dfa, graph: layoutByDepth(dfa.graph) }
}

/**
 * Wechselt den Automatentyp. NEA → DEA fragt in einem kleinen Fenster: umwandeln
 * (Potenzmengenkonstruktion + Minimierung), nur den Typ ändern oder abbrechen.
 * Kellerautomat → endlicher Automat fragt, wenn dabei Stackoperationen verloren gehen,
 * Turingmaschine → anderer Typ, wenn Schreiben und Bewegung verloren gehen.
 * Mealy ↔ Moore fragt wie NEA → DEA: umwandeln (gleiche Übersetzung), nur den Typ ändern oder
 * abbrechen. Transduktor → Akzeptor fragt, wenn Ausgaben verloren gehen, Akzeptor → Transduktor,
 * wenn Endzustände verloren gehen.
 * Die Regeln passt `changeDocumentType` an (z. B. `a` ↔ `a, # → #`).
 */
export async function changeAutomatonType(type: AutomatonType): Promise<void> {
  const store = useEditorStore.getState()
  const { document } = store
  if (document.type === type) return

  if (document.type === 'NFA' && type === 'DFA' && document.graph.states.length > 0) {
    const choice = await askChoice({
      title: 'NEA in DEA umwandeln?',
      detail: 'Potenzmengenkonstruktion, Minimierung und Fangzustand für fehlende Übergänge.',
      buttons: ['Umwandeln', 'Nur Typ ändern', 'Abbrechen']
    })
    if (choice === CONVERT) {
      try {
        store.applyDocument(convertNfaToMinimalDfa(useEditorStore.getState().document))
        store.setStatus(null)
      } catch (err) {
        store.setStatus({ kind: 'error', text: `Umwandlung fehlgeschlagen: ${describeError(err)}` })
      }
      return
    }
    if (choice !== SWITCH_ONLY) return
  }

  const transducers = usesOutput(document.type) && usesOutput(type)
  if (transducers && document.graph.states.length > 0) {
    const toMoore = type === 'MOORE'
    const choice = await askChoice({
      title: toMoore ? 'Mealy in Moore umwandeln?' : 'Moore in Mealy umwandeln?',
      detail: toMoore
        ? 'Jeder Zustand wird nach der Ausgabe aufgeteilt, mit der man ihn betritt.'
        : 'Jede Regel gibt aus, was ihr Zielzustand ausgibt.',
      buttons: ['Umwandeln', 'Nur Typ ändern', 'Abbrechen']
    })
    if (choice === CONVERT) {
      try {
        const current = useEditorStore.getState().document
        store.applyDocument(toMoore ? mealyToMoore(current) : mooreToMealy(current))
        store.setStatus(null)
      } catch (err) {
        store.setStatus({ kind: 'error', text: `Umwandlung fehlgeschlagen: ${describeError(err)}` })
      }
      return
    }
    if (choice !== SWITCH_ONLY) return
  }

  if (!transducers && hasOutputs(document)) {
    const choice = await askChoice({
      title: 'Ausgaben entfernen?',
      detail: 'Von jeder Regel bleibt nur das gelesene Symbol, das Ausgabealphabet entfällt.',
      buttons: ['Typ ändern', 'Abbrechen']
    })
    if (choice !== 0) return
  }

  if (usesOutput(type) && hasFinalStates(document)) {
    const choice = await askChoice({
      title: 'Endzustände entfernen?',
      detail: 'Ein Transduktor hat keine Endzustände, sein Ergebnis ist die Ausgabe.',
      buttons: ['Typ ändern', 'Abbrechen']
    })
    if (choice !== 0) return
  }

  if (usesStack(document.type) && !usesStack(type) && hasStackOperations(document)) {
    const choice = await askChoice({
      title: 'Stackoperationen entfernen?',
      detail: 'Von jeder Regel bleibt nur das gelesene Symbol, das Stackalphabet entfällt.',
      buttons: ['Typ ändern', 'Abbrechen']
    })
    if (choice !== 0) return
  }

  if (hasTapeOperations(document) && type !== document.type) {
    const choice = await askChoice({
      title: 'Bandoperationen entfernen?',
      detail: 'Von jeder Regel bleibt nur das gelesene Symbol aus Σ, das Bandalphabet entfällt.',
      buttons: ['Typ ändern', 'Abbrechen']
    })
    if (choice !== 0) return
  }

  store.applyDocument(changeDocumentType(useEditorStore.getState().document, type))
}

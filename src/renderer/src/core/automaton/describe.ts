import {
  EPSILON,
  acceptsByEmptyStack,
  findState,
  stackSettings,
  type AutomatonDocument,
  type StateId
} from '@/model/graph'
import { formatStack, formatStackWord } from './labels'
import type { SimulationStep } from './types'

const quote = (text: string): string => `„${text}“`

/** „a“, „a und b“, „a, b und c“ */
function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} und ${items[items.length - 1]}`
}

/** Erster Buchstabe groß – für Sätze, die mit einem Teilsatz beginnen */
const sentence = (text: string): string => `${text.charAt(0).toUpperCase()}${text.slice(1)}.`

/**
 * Beschreibt einen Simulationsschritt in einem Satz, z. B. „Es wird „a“ gelesen und in den
 * Endzustand (q2) gewechselt.“ – beim Kellerautomaten mit Stackoperationen, bei der
 * Turingmaschine mit Schreiben und Kopfbewegung. `previous` = Schritt davor (für „beibehalten“).
 */
export function describeStep(
  document: AutomatonDocument,
  step: SimulationStep,
  previous?: SimulationStep
): string {
  const { graph } = document
  const finals = !acceptsByEmptyStack(document)
  const label = (id: StateId): string => findState(graph, id)?.label ?? '?'
  const isFinal = (id: StateId): boolean => finals && findState(graph, id)?.isFinal === true
  const states = step.activeStateIds
  const gamma = stackSettings(document).alphabet

  if (step.index === 0 || !previous) {
    const start =
      states.length === 1
        ? `Start in Zustand ${label(states[0])}`
        : `Start in den Zuständen ${joinList(states.map(label))}`
    const stack = step.stack && `, auf dem Stack liegt ${quote(formatStack(step.stack, gamma))}`
    return sentence(`${start}${stack || ''}`)
  }

  const read = step.label?.read ?? step.symbol ?? EPSILON
  if (states.length === 0) return sentence(`Es gibt keinen Übergang mit ${quote(read)}`)

  const clauses = [read === EPSILON ? 'nichts gelesen' : `${quote(read)} gelesen`]
  const rule = step.label
  if (rule?.pop !== undefined) {
    clauses.push(`${quote(rule.pop)} vom Stack genommen`)
    if (rule.push && rule.push.length > 0) {
      clauses.push(`${quote(formatStackWord(rule.push, gamma))} auf den Stack gelegt`)
    }
  }
  if (rule?.write !== undefined) clauses.push(`${quote(rule.write)} geschrieben`)

  if (states.length === 1) {
    const [state] = states
    const name = isFinal(state) ? `Endzustand (${label(state)})` : `Zustand ${label(state)}`
    const stays = previous.activeStateIds.length === 1 && previous.activeStateIds[0] === state
    const into = isFinal(state) ? `in den ${name}` : `in ${name}`
    clauses.push(stays ? `der ${name} beibehalten` : `${into} gewechselt`)
  } else {
    const names = states.map((id) => (isFinal(id) ? `${label(id)} (Endzustand)` : label(id)))
    clauses.push(`in die Zustände ${joinList(names)} gewechselt`)
  }

  if (rule?.move === 'L') clauses.push('der Kopf nach links bewegt')
  if (rule?.move === 'R') clauses.push('der Kopf nach rechts bewegt')
  if (rule?.move === 'N') clauses.push('der Kopf nicht bewegt')

  return `Es wird ${joinList(clauses)}.`
}

/** Satz zum Ergebnis eines Laufs: „Das Wort „ab“ wird akzeptiert.“ */
export function describeOutcome(
  word: string,
  accepted: boolean,
  abortReason?: string | null
): string {
  if (abortReason) return `${abortReason}.`
  return `Das Wort ${quote(word || EPSILON)} wird ${accepted ? 'akzeptiert' : 'verworfen'}.`
}

import {
  AUTOMATON_TYPES,
  TAPE_MOVES,
  symbolLabels,
  type AutomatonDocument,
  type StateNode,
  type TapeMove,
  type TransitionEdge,
  type TransitionLabel
} from './graph'

export const FILE_FORMAT = 'automat'
/**
 * Version 1: Übergänge mit `symbols: string[]`.
 * Version 2: Übergänge mit Regeln `labels: TransitionLabel[]`, Kellerautomaten mit `stack`.
 */
export const FILE_VERSION = 2

interface AutomatFile {
  format: typeof FILE_FORMAT
  version: number
  document: AutomatonDocument
}

export function serializeDocument(document: AutomatonDocument): string {
  const file: AutomatFile = { format: FILE_FORMAT, version: FILE_VERSION, document }
  return JSON.stringify(file, null, 2)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Version 1 → 2: `symbols: ['a', 'b']` → `labels: [{ read: 'a' }, { read: 'b' }]` */
function migrateSymbolsToLabels(transitions: unknown[]): unknown[] {
  return transitions.map((t) => {
    if (!isRecord(t) || !Array.isArray(t.symbols)) return t
    const { symbols, ...rest } = t
    return { ...rest, labels: symbolLabels(symbols.filter((s) => typeof s === 'string')) }
  })
}

// --- Aufbau prüfen -------------------------------------------------------------------
// Die Datei kommt von außen: Bevor sie als Dokument gilt, muss jedes Feld den richtigen Typ
// haben. Sonst stürzen spätere Stellen ab (z. B. `states: [null]`) oder laufen endlos
// (ein leeres Symbol im Alphabet passt im Tokenizer an jeder Stelle, ohne weiterzukommen).
// Fachliche Fehler (Übergang zu fehlendem Zustand, Symbol nicht in Σ) meldet die Prüfung.

const isString = (value: unknown): value is string => typeof value === 'string'
const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)
const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean'
const isOptional = (value: unknown, check: (v: unknown) => boolean): boolean =>
  value === undefined || check(value)
const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(isString)

function fail(message: string): never {
  throw new Error(message)
}

/** Alphabet: Liste verschiedener, nicht leerer Symbole */
function checkAlphabet(value: unknown, name: string): void {
  if (!isStringArray(value)) fail(`${name} ungültig`)
  const seen = new Set<string>()
  for (const symbol of value) {
    if (symbol === '') fail(`Leeres Symbol in ${name}`)
    if (seen.has(symbol)) fail(`„${symbol}“ doppelt in ${name}`)
    seen.add(symbol)
  }
}

function isLabel(value: unknown): value is TransitionLabel {
  return (
    isRecord(value) &&
    isString(value.read) &&
    isOptional(value.pop, isString) &&
    isOptional(value.push, isStringArray) &&
    isOptional(value.write, isString) &&
    isOptional(value.move, (m) => TAPE_MOVES.includes(m as TapeMove)) &&
    isOptional(value.output, isStringArray)
  )
}

function isState(value: unknown): value is StateNode {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.label) &&
    isNumber(value.x) &&
    isNumber(value.y) &&
    isBoolean(value.isStart) &&
    isBoolean(value.isFinal) &&
    isOptional(value.output, isStringArray)
  )
}

function isTransition(value: unknown): value is TransitionEdge {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.from) &&
    isString(value.to) &&
    Array.isArray(value.labels) &&
    value.labels.every(isLabel)
  )
}

function checkStates(states: unknown[]): void {
  const ids = new Set<string>()
  states.forEach((s, i) => {
    if (!isState(s)) fail(`Zustand Nr. ${i + 1} ungültig`)
    if (ids.has(s.id)) fail(`Zustand „${s.id}“ doppelt`)
    ids.add(s.id)
  })
}

function checkTransitions(transitions: unknown[]): void {
  const ids = new Set<string>()
  transitions.forEach((t, i) => {
    if (!isTransition(t)) fail(`Übergang Nr. ${i + 1} ungültig`)
    if (ids.has(t.id)) fail(`Übergang „${t.id}“ doppelt`)
    ids.add(t.id)
  })
}

function checkStack(stack: unknown): void {
  if (stack === undefined) return
  if (!isRecord(stack)) fail('Stackangaben ungültig')
  checkAlphabet(stack.alphabet, 'Γ')
  if (!(stack.start === null || isString(stack.start))) fail('Startsymbol ungültig')
  if (stack.acceptance !== 'final' && stack.acceptance !== 'empty') fail('Akzeptanz ungültig')
}

function checkTape(tape: unknown): void {
  if (tape === undefined) return
  if (!isRecord(tape)) fail('Bandangaben ungültig')
  checkAlphabet(tape.alphabet, 'Γ')
  if (!isString(tape.blank) || tape.blank === '') fail('Blank ungültig')
}

function checkOutput(output: unknown): void {
  if (output === undefined) return
  if (!isRecord(output)) fail('Ausgabeangaben ungültig')
  checkAlphabet(output.alphabet, 'Δ')
}

export function deserializeDocument(text: string): AutomatonDocument {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('Die Datei enthält kein gültiges JSON.')
  }

  if (!isRecord(data) || data.format !== FILE_FORMAT) {
    throw new Error('Das ist keine Automat-Datei.')
  }
  if (typeof data.version !== 'number' || data.version > FILE_VERSION) {
    throw new Error(`Nicht unterstützte Dateiversion: ${String(data.version)}`)
  }

  const doc = data.document
  if (
    !isRecord(doc) ||
    !AUTOMATON_TYPES.includes(doc.type as (typeof AUTOMATON_TYPES)[number]) ||
    !Array.isArray(doc.alphabet) ||
    !isRecord(doc.graph) ||
    !Array.isArray(doc.graph.states) ||
    !Array.isArray(doc.graph.transitions)
  ) {
    throw new Error('Die Datei enthält keinen gültigen Automaten.')
  }

  // Ältere Dateien enthalten noch ein Feld `name` – der Name kommt inzwischen vom Dateinamen.
  const document: Record<string, unknown> = { ...doc }
  delete document.name
  const transitions =
    data.version < 2 ? migrateSymbolsToLabels(doc.graph.transitions) : doc.graph.transitions
  document.graph = { ...doc.graph, transitions }

  checkAlphabet(doc.alphabet, 'Σ')
  checkStack(doc.stack)
  checkTape(doc.tape)
  checkOutput(doc.output)
  checkStates(doc.graph.states)
  checkTransitions(transitions)
  document.graph = { ...doc.graph, transitions: mergeParallel(transitions as TransitionEdge[]) }
  return document as unknown as AutomatonDocument
}

/**
 * Das Modell hat einen Übergang pro Zustandspaar (Tabelle und Panel verlassen sich darauf).
 * Von Hand geschriebene Dateien können mehrere haben – die werden zum ersten zusammengelegt,
 * gleiche Regeln nur einmal.
 */
function mergeParallel(transitions: TransitionEdge[]): TransitionEdge[] {
  const byPair = new Map<string, TransitionEdge>()
  const seen = new Map<string, Set<string>>()
  for (const t of transitions) {
    const pair = JSON.stringify([t.from, t.to])
    const first = byPair.get(pair)
    if (!first) {
      byPair.set(pair, t)
      seen.set(pair, new Set(t.labels.map((l) => JSON.stringify(l))))
      continue
    }
    const keys = seen.get(pair) as Set<string>
    const added = t.labels.filter((l) => {
      const key = JSON.stringify(l)
      if (keys.has(key)) return false
      keys.add(key)
      return true
    })
    byPair.set(pair, { ...first, labels: [...first.labels, ...added] })
  }
  return [...byPair.values()]
}

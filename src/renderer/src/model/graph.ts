/**
 * Datenmodell des Editors: ein gezeichneter Graph aus Zuständen und Übergängen.
 *
 * Dieses Modell ist bewusst "dumm" – es kennt keine Automaten-Semantik.
 * Die Bedeutung (DEA, NEA, …) liefert `core/automaton`.
 */

import type { AutomatonType, StackAcceptance, TapeMove } from '@shared/automatonTypes'
import { overlapProblem } from '@shared/alphabetRules'
import { DEFAULT_NEW_AUTOMATON, type NewAutomatonSettings } from '@shared/newAutomaton'

export { AUTOMATON_TYPES, TAPE_MOVES } from '@shared/automatonTypes'
export type { AutomatonType, StackAcceptance, TapeMove } from '@shared/automatonTypes'

export type StateId = string
export type TransitionId = string

/** Kellerautomaten: Kanten tragen Stackoperationen, das Dokument hat ein Stackalphabet Γ. */
const PUSHDOWN_TYPES: readonly AutomatonType[] = ['DPDA', 'NPDA']

export function usesStack(type: AutomatonType): boolean {
  return PUSHDOWN_TYPES.includes(type)
}

/** Turingmaschine: Kanten schreiben aufs Band und bewegen den Kopf, Bandalphabet Γ ⊇ Σ. */
export function usesTape(type: AutomatonType): boolean {
  return type === 'TM'
}

/**
 * Transduktoren (Mealy, Moore): erzeugen beim Lesen ein Ausgabewort über dem Ausgabealphabet Δ.
 * Sie haben keine Endzustände – das Ergebnis ist die Ausgabe.
 */
export function usesOutput(type: AutomatonType): boolean {
  return type === 'MEALY' || type === 'MOORE'
}

/** Moore-Automat: die Ausgabe hängt am Zustand statt am Übergang. */
export function outputsOnStates(type: AutomatonType): boolean {
  return type === 'MOORE'
}

export interface StateNode {
  id: StateId
  label: string
  /** Position in Welt-Koordinaten (Mittelpunkt des Kreises) */
  x: number
  y: number
  isStart: boolean
  isFinal: boolean
  /** Moore-Automat: Ausgabe λ(z) beim Betreten des Zustands – fehlt = ε */
  output?: string[]
}


/**
 * Eine Regel an einem Übergang. Endliche Automaten nutzen nur `read`, Kellerautomaten
 * zusätzlich `pop` und `push` – Schreibweise `a, Z → AZ` –, Turingmaschinen `write` und
 * `move` – Schreibweise `a → b, R` –, Mealy-Automaten `output` – Schreibweise `a/xy`.
 */
export interface TransitionLabel {
  /** Gelesenes Eingabesymbol (Turingmaschine: Bandsymbol unter dem Kopf) – ε = ohne zu lesen */
  read: string
  /** Kellerautomat: Top of Stack – das oberste Stacksymbol, das entfernt wird (immer aus Γ) */
  pop?: string
  /** Kellerautomat: Symbole, die auf den Stack kommen – das erste liegt danach oben */
  push?: string[]
  /** Turingmaschine: Symbol, das an die Stelle von `read` geschrieben wird */
  write?: string
  /** Turingmaschine: Kopfbewegung danach */
  move?: TapeMove
  /** Mealy-Automat: Ausgabewort beim Schalten – [] = ε */
  output?: string[]
}

export interface TransitionEdge {
  id: TransitionId
  from: StateId
  to: StateId
  /** Regeln, mit denen dieser Übergang schaltet (ein Übergang pro Zustandspaar) */
  labels: TransitionLabel[]
}

export interface EditorGraph {
  states: StateNode[]
  transitions: TransitionEdge[]
}

/** Akzeptanz beim Kellerautomaten: Wort gelesen und Endzustand erreicht bzw. Stack leer */

/** Zusatzangaben des Kellerautomaten */
export interface StackSettings {
  /** Stackalphabet Γ */
  alphabet: string[]
  /** Stack-Startsymbol (liegt am Anfang allein im Stack) – `null` = Stack startet leer */
  start: string | null
  acceptance: StackAcceptance
}

/** Zusatzangaben der Turingmaschine */
export interface TapeSettings {
  /** Bandalphabet Γ – enthält Σ und das Blank */
  alphabet: string[]
  /** Leerzeichen des Bands (steht überall, wo nichts geschrieben ist) */
  blank: string
}

/** Zusatzangaben der Transduktoren */
export interface OutputSettings {
  /** Ausgabealphabet Δ */
  alphabet: string[]
}

/** Der Name des Automaten ist kein Teil des Dokuments – er kommt vom Dateinamen. */
export interface AutomatonDocument {
  type: AutomatonType
  /** Eingabealphabet Σ */
  alphabet: string[]
  /** Nur beim Kellerautomaten */
  stack?: StackSettings
  /** Nur bei der Turingmaschine */
  tape?: TapeSettings
  /** Nur bei Transduktoren (Mealy, Moore) */
  output?: OutputSettings
  graph: EditorGraph
}

/**
 * Vorgaben aus den Einstellungen (Reiter „Neuer Automat“): Zustandsnamen, Startsymbol,
 * Akzeptanz, Blank und Bewegung neuer Bandregeln. Gelten überall, wo das Modell etwas neu
 * anlegt – auch beim Typwechsel. Ohne Einstellungen (Tests) die Standardwerte.
 */
let defaults: NewAutomatonSettings = { ...DEFAULT_NEW_AUTOMATON }

export function documentDefaults(): NewAutomatonSettings {
  return defaults
}

export function setDocumentDefaults(next: NewAutomatonSettings): void {
  defaults = { ...next }
}

/** Übliches Stack-Startsymbol (Stackboden) */
export const STACK_BOTTOM = '#'

export function createStackSettings(): StackSettings {
  const { stackStart, acceptance } = defaults
  return { alphabet: [stackStart], start: stackStart, acceptance }
}

/** Stackangaben des Dokuments – bei Dokumenten ohne Stack die Voreinstellung. */
export function stackSettings(document: AutomatonDocument): StackSettings {
  return document.stack ?? createStackSettings()
}

/**
 * Akzeptiert der Automat ohne Endzustand (Kellerautomat mit leerem Stack)? Dann färbt die
 * Simulation am Ende den aktiven Zustand grün, auch wenn er kein Endzustand ist.
 */
export function acceptsByEmptyStack(document: AutomatonDocument): boolean {
  return usesStack(document.type) && stackSettings(document).acceptance === 'empty'
}

/**
 * Endet ein erfolgreicher Lauf in jedem Zustand (Kellerautomat mit leerem Stack, Transduktor)?
 * Dann färbt die Simulation am Ende den aktiven Zustand grün, und Endzustände zählen nicht.
 */
export function endsWithoutFinal(document: AutomatonDocument): boolean {
  return acceptsByEmptyStack(document) || usesOutput(document.type)
}

export function createOutputSettings(): OutputSettings {
  return { alphabet: [] }
}

/** Ohne Ausgabeangaben: immer dasselbe Objekt, damit Store-Selektoren stabil bleiben */
const NO_OUTPUT: OutputSettings = Object.freeze({ alphabet: Object.freeze([]) as unknown as string[] })

/** Ausgabeangaben des Dokuments – bei Dokumenten ohne Ausgabe ein leeres Δ. */
export function outputSettings(document: AutomatonDocument): OutputSettings {
  return document.output ?? NO_OUTPUT
}

/** Moore-Ausgabe eines Zustands – ohne Angabe ε */
export function stateOutput(state: StateNode): string[] {
  return state.output ?? []
}

/** Übliches Blank der Turingmaschine */
export const BLANK = '#'
/**
 * Eingaben für das Blank: „_“ und das Lehrbuch-Kästchen □. „#“ nicht – bei einem anderen Blank
 * ist # ein gewöhnliches Bandsymbol.
 */
const BLANK_SPELLINGS = new Set(['□', '_'])

/** Bandalphabet Γ = Σ ∪ {Blank} – Blank aus den Vorgaben (Standard #) */
/** Ersatz-Blanks, falls das voreingestellte Blank schon in Σ liegt */
const SPARE_BLANKS = ['#', '$', '§', '%', '&', '~']

/** Bandangaben zu Σ: Γ = Σ ∪ {Blank}, das Blank nie aus Σ (sonst wäre die Maschine ungültig). */
export function createTapeSettings(alphabet: string[] = []): TapeSettings {
  const taken = new Set(alphabet)
  const blank = [defaults.blank, ...SPARE_BLANKS].find((s) => !taken.has(s)) ?? freeSymbol(taken)
  return { alphabet: [...alphabet, blank], blank }
}

function freeSymbol(taken: Set<string>): string {
  for (let i = 0; ; i++) if (!taken.has(`#${i}`)) return `#${i}`
}

/** Bandangaben des Dokuments – bei Dokumenten ohne Band die Voreinstellung. */
export function tapeSettings(document: AutomatonDocument): TapeSettings {
  return document.tape ?? createTapeSettings(document.alphabet)
}

/** Vereinheitlicht ein eingegebenes Bandsymbol („_“ → Blank). */
export function normalizeTapeSymbol(symbol: string, blank: string): string {
  const trimmed = symbol.trim()
  return BLANK_SPELLINGS.has(trimmed) ? blank : trimmed
}

export function createEmptyDocument(
  type: AutomatonType = 'DFA',
  alphabet: string[] = []
): AutomatonDocument {
  return {
    type,
    alphabet: [...alphabet],
    ...(usesStack(type) ? { stack: createStackSettings() } : {}),
    ...(usesTape(type) ? { tape: createTapeSettings(alphabet) } : {}),
    ...(usesOutput(type) ? { output: createOutputSettings() } : {}),
    graph: { states: [], transitions: [] }
  }
}

let idCounter = 0
export function createId(prefix: string): string {
  idCounter += 1
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

/** Zustandsname Nummer `i`: q0, q1, … – Präfix aus den Vorgaben */
export function stateName(i: number): string {
  return `${defaults.statePrefix}${i}`
}

/** Nächste freie Bezeichnung q0, q1, q2, … */
export function nextStateLabel(graph: EditorGraph): string {
  const used = new Set(graph.states.map((s) => s.label))
  let i = 0
  while (used.has(stateName(i))) i++
  return stateName(i)
}

/**
 * Neuer Zustand – ohne `label` mit der nächsten freien Bezeichnung (q0, q1, …).
 * Wird Startzustand, falls es noch keinen gibt.
 */
export function createStateNode(
  graph: EditorGraph,
  x: number,
  y: number,
  id: StateId = createId('s'),
  label: string = nextStateLabel(graph)
): StateNode {
  return {
    id,
    label,
    x,
    y,
    isStart: !graph.states.some((s) => s.isStart),
    isFinal: false
  }
}

const STATE_SPACING = 120

/** Position für Zustände, die nicht im Canvas angelegt werden: rechts neben dem rechtesten. */
export function nextStatePosition(graph: EditorGraph): { x: number; y: number } {
  if (graph.states.length === 0) return { x: STATE_SPACING, y: STATE_SPACING }
  const rightmost = graph.states.reduce((a, b) => (b.x > a.x ? b : a))
  return { x: rightmost.x + STATE_SPACING, y: rightmost.y }
}

/**
 * Das leere Wort als Kantenbeschriftung (ε-Übergang beim NEA).
 * Gehört nie zum Alphabet Σ. Eingaben wie „eps“ oder „epsilon“ werden zu ε.
 */
export const EPSILON = 'ε'
const EPSILON_SPELLINGS = new Set([EPSILON, 'eps', 'epsilon'])

/** Vereinheitlicht ein eingegebenes Symbol (z. B. „eps“ → „ε“). */
export function normalizeSymbol(symbol: string): string {
  const trimmed = symbol.trim()
  return EPSILON_SPELLINGS.has(trimmed.toLowerCase()) ? EPSILON : trimmed
}

/** "a, b c;d" → ["a", "b", "c", "d"] (ohne Duplikate, „eps“ → „ε“) */
export function parseSymbols(input: string): string[] {
  const symbols = input
    .split(/[,;\s]+/)
    .map(normalizeSymbol)
    .filter(Boolean)
  return [...new Set(symbols)]
}

const INPUT_CANDIDATES = [...'abcdefghijklmnopqrstuvwxyz0123456789']
/** Stacksymbole üblicherweise groß: A, B, …, Z */
export const STACK_CANDIDATES = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789']
/** Ausgaben üblicherweise Ziffern: 0, 1, …, 9, dann a, b, … */
export const OUTPUT_CANDIDATES = [...'0123456789abcdefghijklmnopqrstuvwxyz']

/** Nach den üblichen Kandidaten: griechische Buchstaben ohne ε */
const EXTRA_CANDIDATES = [...'αβγδζηθικλμνξοπρστυφχψω']

/**
 * Nächstes freies Symbol: a, b, …, z, dann 0, …, 9, dann α, β, … – immer ein einzelnes Zeichen,
 * das in keinem Mehrzeichen-Symbol steckt (`overlapProblem`).
 */
export function nextFreeSymbol(alphabet: string[], candidates = INPUT_CANDIDATES): string {
  const free = (s: string): boolean =>
    s !== EPSILON && !alphabet.includes(s) && overlapProblem(alphabet, s) === null
  const found = [...candidates, ...EXTRA_CANDIDATES].find(free)
  if (found) return found
  // Alles Übliche belegt: der nächste freie Buchstabe ab U+0100
  for (let code = 0x100; ; code++) {
    const c = String.fromCodePoint(code)
    if (/\p{L}/u.test(c) && free(c)) return c
  }
}

/**
 * Prüft ein Symbol, bevor es ins Alphabet kommt. Liefert eine Fehlermeldung oder `null`.
 * `previous` ist das Symbol, das gerade umbenannt wird (darf natürlich "doppelt" sein).
 */
export function validateSymbol(alphabet: string[], symbol: string, previous?: string): string | null {
  if (symbol === '') return 'Ein Symbol darf nicht leer sein.'
  if (normalizeSymbol(symbol) === EPSILON) {
    return 'ε ist das leere Wort und kein Symbol des Alphabets.'
  }
  // Diese Zeichen trennen Symbole in parseSymbols – im Symbol selbst wären sie mehrdeutig.
  if (/[,;\s]/.test(symbol)) return 'Ein Symbol darf kein Leerzeichen, Komma oder Semikolon enthalten.'
  if (symbol !== previous && alphabet.includes(symbol)) return `„${symbol}“ doppelt`
  return overlapProblem(
    alphabet.filter((s) => s !== previous),
    symbol
  )
}

/**
 * Reihenfolge für das alphabetische Sortieren. `numeric` sortiert Zahlen nach Wert,
 * also x2 vor x10 (statt x10 vor x2 wie beim reinen Zeichenvergleich).
 */
export function compareSymbols(a: string, b: string): number {
  return a.localeCompare(b, 'de', { numeric: true })
}

// --- Regeln ------------------------------------------------------------------

/** Regeln aus reinen Eingabesymbolen (endliche Automaten). */
export function symbolLabels(symbols: string[]): TransitionLabel[] {
  return symbols.map((read) => ({ read }))
}

/** Gelesene Symbole eines Übergangs ohne Duplikate – für die endlichen Automaten. */
export function edgeSymbols(edge: TransitionEdge): string[] {
  return [...new Set(edge.labels.map((l) => l.read))]
}

/** Welches Alphabet: Eingabealphabet Σ, Stackalphabet Γ, Bandalphabet Γ oder Ausgabealphabet Δ */
export type AlphabetKind = 'input' | 'stack' | 'tape' | 'output'

/** Symbole, die eine Regel im jeweiligen Alphabet benutzt (pop ε zählt als ε) */
export function labelSymbols(label: TransitionLabel, kind: AlphabetKind): string[] {
  if (kind === 'input') return [label.read]
  if (kind === 'tape') return [label.read, ...(label.write === undefined ? [] : [label.write])]
  if (kind === 'output') return label.output ?? []
  return [label.pop ?? EPSILON, ...(label.push ?? [])]
}

/** Schaltet der Übergang mit diesem Eingabesymbol (bzw. ε)? */
export function readsSymbol(edge: TransitionEdge, symbol: string): boolean {
  return edge.labels.some((l) => l.read === symbol)
}

/** Eindeutiger Schlüssel einer Regel – zwei Regeln mit gleichem Schlüssel sind gleich. */
export function labelKey(label: TransitionLabel): string {
  if (label.output !== undefined) return `${label.read}␟/${label.output.join(' ')}`
  if (label.write !== undefined) return `${label.read}␟${label.write}␟${label.move ?? ''}`
  if (label.pop === undefined) return label.read
  return `${label.read}␟${label.pop}␟${(label.push ?? []).join(' ')}`
}

const hasLabel = (labels: TransitionLabel[], label: TransitionLabel): boolean =>
  labels.some((l) => labelKey(l) === labelKey(label))

// --- Übergangstabelle --------------------------------------------------------
// Im Graph gibt es einen Übergang pro Zustandspaar mit mehreren Regeln. Die Tabelle zeigt
// stattdessen eine Zeile pro Regel δ(from, symbol[, pop]) ∋ (to[, push]). Diese Funktionen
// übersetzen zwischen beidem.

/**
 * Eine Zeile der Übergangstabelle. `symbol: null` = Übergang ohne Regel.
 * Beim Kellerautomaten kommen `pop` und `push` dazu, beim Mealy-Automaten `output`.
 */
export interface TransitionEntry {
  from: StateId
  symbol: string | null
  to: StateId
  pop?: string
  push?: string[]
  output?: string[]
}

/** Die Regel einer Zeile – `null` bei einem Übergang ohne Regel. */
export function entryLabel(entry: TransitionEntry): TransitionLabel | null {
  if (entry.symbol === null) return null
  if (entry.output !== undefined) return { read: entry.symbol, output: entry.output }
  if (entry.pop === undefined) return { read: entry.symbol }
  return { read: entry.symbol, pop: entry.pop, push: entry.push ?? [] }
}

function labelEntry(from: StateId, label: TransitionLabel, to: StateId): TransitionEntry {
  if (label.output !== undefined) return { from, symbol: label.read, to, output: label.output }
  if (label.pop === undefined) return { from, symbol: label.read, to }
  return { from, symbol: label.read, to, pop: label.pop, push: label.push ?? [] }
}

/** Alle Tabellenzeilen in Dokument-Reihenfolge. */
export function listTransitionEntries(graph: EditorGraph): TransitionEntry[] {
  return graph.transitions.flatMap((t): TransitionEntry[] =>
    t.labels.length === 0
      ? [{ from: t.from, symbol: null, to: t.to }]
      : t.labels.map((label) => labelEntry(t.from, label, t.to))
  )
}

/** Eindeutiger Schlüssel einer Zeile (pro Zustandspaar ist jede Regel höchstens einmal da). */
export function entryKey(entry: TransitionEntry): string {
  const label = entryLabel(entry)
  return JSON.stringify([entry.from, label ? labelKey(label) : '', entry.to])
}

const sameEntry = (a: TransitionEntry, b: TransitionEntry): boolean => entryKey(a) === entryKey(b)

/**
 * Sortiert nach Zustand, dann Symbol (beim Stack dann Stacksymbol und Push), dann
 * Folgezustand – jeweils alphabetisch (q2 vor q10).
 */
export function sortTransitionEntries(
  graph: EditorGraph,
  entries: TransitionEntry[]
): TransitionEntry[] {
  const label = (id: StateId): string => findState(graph, id)?.label ?? ''
  return [...entries].sort(
    (a, b) =>
      compareSymbols(label(a.from), label(b.from)) ||
      // Zeilen ohne Symbol ans Ende des Zustands
      (a.symbol === null ? 1 : 0) - (b.symbol === null ? 1 : 0) ||
      compareSymbols(a.symbol ?? '', b.symbol ?? '') ||
      compareSymbols(a.pop ?? '', b.pop ?? '') ||
      compareSymbols((a.push ?? []).join(' '), (b.push ?? []).join(' ')) ||
      compareSymbols((a.output ?? []).join(' '), (b.output ?? []).join(' ')) ||
      compareSymbols(label(a.to), label(b.to))
  )
}

/** Fügt eine Zeile hinzu – legt den Übergang an, falls es ihn für das Zustandspaar noch nicht gibt. */
export function addTransitionEntry(graph: EditorGraph, entry: TransitionEntry): EditorGraph {
  const label = entryLabel(entry)
  const edge = graph.transitions.find((t) => t.from === entry.from && t.to === entry.to)
  if (!edge) {
    const labels = label === null ? [] : [label]
    const created: TransitionEdge = { id: createId('t'), from: entry.from, to: entry.to, labels }
    return { ...graph, transitions: [...graph.transitions, created] }
  }
  if (label === null || hasLabel(edge.labels, label)) return graph
  return {
    ...graph,
    transitions: graph.transitions.map((t) =>
      t === edge ? { ...t, labels: [...t.labels, label] } : t
    )
  }
}

/** Entfernt eine Zeile. Hat der Übergang danach keine Regel mehr, verschwindet er ganz. */
export function removeTransitionEntry(graph: EditorGraph, entry: TransitionEntry): EditorGraph {
  const edge = graph.transitions.find((t) => t.from === entry.from && t.to === entry.to)
  if (!edge) return graph
  const label = entryLabel(entry)
  const labels =
    label === null ? edge.labels : edge.labels.filter((l) => labelKey(l) !== labelKey(label))
  // Zeile ohne Regel gibt es nur, solange der Übergang keine Regeln hat.
  if (label === null && labels.length > 0) return graph
  if (labels.length === edge.labels.length && label !== null) return graph
  return {
    ...graph,
    transitions:
      labels.length === 0
        ? graph.transitions.filter((t) => t !== edge)
        : graph.transitions.map((t) => (t === edge ? { ...t, labels } : t))
  }
}

/** Ändert eine Zeile. Bleibt das Zustandspaar gleich, behält die Regel ihre Position. */
export function replaceTransitionEntry(
  graph: EditorGraph,
  previous: TransitionEntry,
  next: TransitionEntry
): EditorGraph {
  if (sameEntry(previous, next)) return graph
  const edge = graph.transitions.find((t) => t.from === previous.from && t.to === previous.to)
  const oldLabel = entryLabel(previous)
  if (edge && previous.from === next.from && previous.to === next.to && oldLabel !== null) {
    const newLabel = entryLabel(next)
    const oldKey = labelKey(oldLabel)
    // Neue Regel gibt es schon auf diesem Übergang → Zeilen verschmelzen.
    const labels =
      newLabel === null || hasLabel(edge.labels, newLabel)
        ? edge.labels.filter((l) => labelKey(l) !== oldKey)
        : edge.labels.map((l) => (labelKey(l) === oldKey ? newLabel : l))
    return {
      ...graph,
      transitions: graph.transitions.map((t) => (t === edge ? { ...t, labels } : t))
    }
  }
  // Erst hinzufügen, dann entfernen – so bleibt ein bestehender Übergang (und seine ID) erhalten.
  return removeTransitionEntry(addTransitionEntry(graph, next), previous)
}

export function findState(graph: EditorGraph, id: StateId): StateNode | undefined {
  return graph.states.find((s) => s.id === id)
}

export function findTransition(graph: EditorGraph, id: TransitionId): TransitionEdge | undefined {
  return graph.transitions.find((t) => t.id === id)
}

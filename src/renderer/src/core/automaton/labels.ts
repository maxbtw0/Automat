import {
  EPSILON,
  STACK_BOTTOM,
  TAPE_MOVES,
  documentDefaults,
  labelKey,
  normalizeSymbol,
  normalizeTapeSymbol,
  parseSymbols,
  stackSettings,
  symbolLabels,
  tapeSettings,
  usesStack,
  usesTape,
  type AutomatonDocument,
  type TapeMove,
  type TransitionLabel
} from '@/model/graph'
import type { TapeSnapshot } from './types'
import { tokenizeWord } from './word'

/**
 * Kantenbeschriftungen als Text – für Canvas, Eingabefelder, Tabellen und Export.
 *
 *   endlicher Automat:  a, b                  (Symbole durch Komma getrennt)
 *   Kellerautomat:      a, # → A#; b, A → ε   (Regeln durch Semikolon getrennt)
 *   Turingmaschine:     a → X, R; # → #, L    (Regeln durch Semikolon getrennt)
 *
 * Stackregel `a, Z → AZ`: lies a, nimm Z vom Stack, lege AZ ab (A liegt danach oben).
 * Turingregel `a → X, R`: lies a unter dem Kopf, schreibe X, gehe nach rechts (L, R, N).
 * Beim Eingeben geht statt → auch -> oder /, ε auch als „eps“ oder leer, das Blank auch als „_“.
 * Turingregeln gehen auch kurz ohne Pfeil: „a X R“ (Bewegung auch klein), Stackregeln ebenso:
 * „a Z AZ“ oder „a, Z, AZ“ (Eingabe, Top of Stack, Push).
 */

/** Stackregel mit allen Feldern */
export interface PushdownLabel {
  read: string
  /** Top of Stack: wird vom Stack genommen (immer ein Symbol aus Γ) */
  pop: string
  /** [] = nichts ablegen (ε) */
  push: string[]
}

export function asPushdown(label: TransitionLabel): PushdownLabel {
  return { read: label.read, pop: label.pop ?? EPSILON, push: label.push ?? [] }
}

/** Turingregel mit allen Feldern */
export interface TuringLabel {
  read: string
  write: string
  move: TapeMove
}

/** Fehlt `write`, bleibt das gelesene Symbol stehen; fehlt `move`, bleibt der Kopf stehen. */
export function asTuring(label: TransitionLabel): TuringLabel {
  return { read: label.read, write: label.write ?? label.read, move: label.move ?? 'N' }
}

const isTuringLabel = (label: TransitionLabel): boolean =>
  label.write !== undefined || label.move !== undefined

/**
 * Stackwort: „A#“, leer „ε“. Mehrzeichen-Symbole mit Leerzeichen getrennt („X1 #“).
 *
 * Mit dem Stackalphabet Γ wird auch dann getrennt, wenn die Verkettung beim Zurücklesen
 * (`parseStackWord`) andere Symbole ergäbe – bei Γ = {A, B, AB} wird [A, B] zu „A B“, nicht
 * „AB“. Wer formatiert und wieder einliest, muss Γ deshalb mitgeben.
 */
export function formatStackWord(symbols: string[], stackAlphabet?: string[]): string {
  if (symbols.length === 0) return EPSILON
  if (symbols.some((s) => s.length > 1)) return symbols.join(' ')
  const joined = symbols.join('')
  if (stackAlphabet && !sameSymbols(parseStackWord(joined, stackAlphabet), symbols)) {
    return symbols.join(' ')
  }
  return joined
}

const sameSymbols = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((s, i) => s === b[i])

/** Stackinhalt (oben = letztes Element) wie im Lehrbuch: oberstes Symbol links. */
export function formatStack(stack: string[], stackAlphabet?: string[]): string {
  return formatStackWord([...stack].reverse(), stackAlphabet)
}

/** Eine Regel als Text – Γ wie bei `formatStackWord`, damit das Push-Wort eindeutig bleibt. */
export function formatLabel(label: TransitionLabel, stackAlphabet?: string[]): string {
  if (isTuringLabel(label)) {
    const { read, write, move } = asTuring(label)
    return `${read} → ${write}, ${move}`
  }
  if (label.pop === undefined) return label.read
  return `${label.read}, ${label.pop} → ${formatStackWord(label.push ?? [], stackAlphabet)}`
}

const isSymbolOnly = (labels: TransitionLabel[]): boolean =>
  labels.every((l) => l.pop === undefined && !isTuringLabel(l))

/** Zeilen der Beschriftung im Graphen: Symbole in einer Zeile, Stackregeln je eine Zeile. */
export function labelLines(labels: TransitionLabel[], stackAlphabet?: string[]): string[] {
  if (labels.length === 0) return []
  if (isSymbolOnly(labels)) return [labels.map((l) => l.read).join(', ')]
  return labels.map((l) => formatLabel(l, stackAlphabet))
}

/** Beschriftung in einer Zeile – für Eingabefelder und Listen (Γ wie bei `formatLabel`). */
export function formatLabelsInline(labels: TransitionLabel[], stackAlphabet?: string[]): string {
  return labels.map((l) => formatLabel(l, stackAlphabet)).join(isSymbolOnly(labels) ? ', ' : '; ')
}

/** Stackwort aus Text: „A#“, „A #“, „ε“/„“ → []. Längstes Symbol aus Γ zuerst. */
export function parseStackWord(text: string, stackAlphabet: string[]): string[] {
  const trimmed = text.trim()
  if (trimmed === '' || normalizeSymbol(trimmed) === EPSILON) return []
  return trimmed
    .split(/\s+/)
    .flatMap((part) => tokenizeWord(part, stackAlphabet))
    .filter((s) => s !== EPSILON)
}

/**
 * Vorschläge für das abgelegte Stackwort: ε (nur entfernen), das Top of Stack zurücklegen,
 * ein Symbol darauflegen.
 */
export function pushSuggestions(pop: string, stackAlphabet: string[]): string[] {
  const words = [[pop], ...stackAlphabet.map((s) => [s, pop])]
  return [...new Set([EPSILON, ...words.map((w) => formatStackWord(w, stackAlphabet))])]
}

/**
 * Neue Regel für einen Übergang: die erste Kombination aus Eingabe ∈ Σ und Stacksymbol ∈ Γ,
 * die es dort noch nicht gibt; der Stack bleibt unverändert (Push = Stacksymbol).
 */
export function nextPushdownLabel(
  existing: TransitionLabel[],
  alphabet: string[],
  stackAlphabet: string[]
): TransitionLabel {
  const reads = alphabet.length > 0 ? alphabet : [EPSILON]
  const pops = stackAlphabet.length > 0 ? stackAlphabet : [STACK_BOTTOM]
  const make = (read: string, pop: string): TransitionLabel => ({ read, pop, push: [pop] })
  for (const read of reads) {
    for (const pop of pops) {
      if (!existing.some((l) => l.read === read && l.pop === pop)) return make(read, pop)
    }
  }
  return make(EPSILON, pops[0])
}

const RULE = /^([^,]*),([^→/]*?)(?:→|->|\/)(.*)$/

/**
 * Kurzform ohne Pfeil: „a Z AZ“ oder „a, Z, AZ“ = lies a, nimm Z vom Stack, lege AZ ab.
 * Getrennt durch Leerzeichen oder Komma; alles ab dem dritten Teil ist das Push-Wort
 * („a # A #“ = „a # A#“).
 */
function parseShortPushdownRule(text: string, stackAlphabet: string[]): TransitionLabel | null {
  const parts = text.split(/[\s,]+/).filter(Boolean)
  if (parts.length < 3) return null
  const [read, pop] = parts.map((p) => normalizeSymbol(p))
  return { read, pop, push: parseStackWord(parts.slice(2).join(' '), stackAlphabet) }
}

/** Eine Stackregel „a, Z → AZ“ oder kurz „a Z AZ“ – `null`, wenn der Text keine Regel ist. */
export function parsePushdownRule(text: string, stackAlphabet: string[]): TransitionLabel | null {
  const match = RULE.exec(text.trim())
  if (!match) return parseShortPushdownRule(text, stackAlphabet)
  const read = normalizeSymbol(match[1]) || EPSILON
  const pop = normalizeSymbol(match[2]) || EPSILON
  if (/\s/.test(read) || /\s/.test(pop)) return null
  return { read, pop, push: parseStackWord(match[3], stackAlphabet) }
}

/** Kopfbewegung aus Text: L, R, N (auch klein geschrieben) – sonst `null` */
export function parseMove(text: string): TapeMove | null {
  const move = text.trim().toUpperCase()
  return TAPE_MOVES.find((m) => m === move) ?? null
}

const TURING_RULE = /^([^→/]*?)(?:→|->|\/)(.*)$/

/**
 * Kurzform ohne Pfeil: „a A R“ = lies a, schreibe A, gehe nach rechts; „a R“ schreibt a zurück.
 * Getrennt durch Leerzeichen oder Komma.
 */
function parseShortTuringRule(text: string, blank: string): TransitionLabel | null {
  const parts = text.split(/[\s,]+/).filter(Boolean)
  if (parts.length < 2 || parts.length > 3) return null
  const move = parseMove(parts.at(-1) ?? '')
  if (!move) return null
  const read = normalizeTapeSymbol(parts[0], blank)
  const write = parts.length === 3 ? normalizeTapeSymbol(parts[1], blank) : read
  return { read, write, move }
}

/**
 * Eine Turingregel „a → X, R“ oder kurz „a X R“ – `null`, wenn der Text keine Regel ist.
 * „a → R“ bzw. „a R“ schreibt das gelesene Symbol zurück, eine leere Leseseite oder „_“ meint
 * das Blank. Die Bewegung darf auch klein geschrieben sein.
 */
export function parseTuringRule(text: string, blank: string): TransitionLabel | null {
  const match = TURING_RULE.exec(text.trim())
  if (!match) return parseShortTuringRule(text, blank)
  const read = normalizeTapeSymbol(match[1], blank) || blank
  const parts = match[2].split(',').map((p) => p.trim())
  if (parts.length > 2 || /\s/.test(read)) return null
  const move = parseMove(parts.at(-1) ?? '')
  if (!move) return null
  const write = parts.length === 2 ? normalizeTapeSymbol(parts[0], blank) || blank : read
  if (/\s/.test(write)) return null
  return { read, write, move }
}

/**
 * Neue Regel für einen Zustand der Turingmaschine: das erste Bandsymbol, das der Zustand noch
 * nicht liest; das Symbol bleibt, der Kopf bewegt sich wie in den Vorgaben (Standard N).
 * `null`, wenn alle belegt sind.
 */
export function nextTuringLabel(
  stateRules: TransitionLabel[],
  tapeAlphabet: string[]
): TransitionLabel | null {
  const read = tapeAlphabet.find((s) => !stateRules.some((l) => l.read === s))
  return read === undefined ? null : { read, write: read, move: documentDefaults().tapeMove }
}

/** Bandinhalt mit Kopf in eckigen Klammern: „Xa[a]bb“ (Mehrzeichen-Symbole mit Leerzeichen). */
export function formatTape(tape: TapeSnapshot, head: number): string {
  const separator = tape.symbols.some((s) => s.length > 1) ? ' ' : ''
  return tape.symbols.map((s, i) => (tape.start + i === head ? `[${s}]` : s)).join(separator)
}

export type LabelParseResult = { labels: TransitionLabel[] } | { error: string }

/** Eingegebene Beschriftung → Regeln, passend zum Typ des Dokuments (ohne Duplikate). */
export function parseLabels(text: string, document: AutomatonDocument): LabelParseResult {
  const tape = usesTape(document.type)
  if (!tape && !usesStack(document.type)) return { labels: symbolLabels(parseSymbols(text)) }
  const stackAlphabet = stackSettings(document).alphabet
  const { blank } = tapeSettings(document)
  const labels: TransitionLabel[] = []
  for (const rule of text.split(/[;\n]/).map((r) => r.trim()).filter(Boolean)) {
    const label = tape ? parseTuringRule(rule, blank) : parsePushdownRule(rule, stackAlphabet)
    if (!label) {
      const kind = tape ? 'Bandregel (a A R)' : 'Stackregel (a, Z → AZ)'
      return { error: `„${rule}“ ist keine ${kind}` }
    }
    // Kellerautomat: jede Regel nimmt ein Symbol vom Stack
    if (!tape && label.pop === EPSILON) return { error: `„${rule}“: Top of Stack fehlt` }
    if (!labels.some((l) => labelKey(l) === labelKey(label))) labels.push(label)
  }
  return { labels }
}

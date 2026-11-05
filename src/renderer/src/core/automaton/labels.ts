import {
  EPSILON,
  STACK_BOTTOM,
  TAPE_MOVES,
  documentDefaults,
  labelKey,
  normalizeSymbol,
  normalizeTapeSymbol,
  outputSettings,
  outputsOnStates,
  parseSymbols,
  stackSettings,
  stateOutput,
  symbolLabels,
  tapeSettings,
  usesOutput,
  usesStack,
  usesTape,
  type AutomatonDocument,
  type StateNode,
  type TapeMove,
  type TransitionLabel
} from '@/model/graph'
import type { TapeSnapshot } from './types'
import { joinWord, tokenizeWord } from './word'

/**
 * Kantenbeschriftungen als Text – für Canvas, Eingabefelder, Tabellen und Export.
 *
 *   endlicher Automat:  a, b                  (Symbole durch Komma getrennt)
 *   Kellerautomat:      a, # → A#; b, A → ε   (Regeln durch Semikolon getrennt)
 *   Turingmaschine:     a → X, R; # → #, L    (Regeln durch Semikolon getrennt)
 *   Mealy-Automat:      a/0, b/11             (Regeln durch Komma getrennt, Ausgabe leer = ε)
 *
 * Stackregel `a, Z → AZ`: lies a, nimm Z vom Stack, lege AZ ab (A liegt danach oben).
 * Turingregel `a → X, R`: lies a unter dem Kopf, schreibe X, gehe nach rechts (L, R, N).
 * Beim Eingeben geht statt → auch -> oder /, ε auch als „eps“ oder leer, das Blank auch als „_“.
 * Turingregeln gehen auch kurz ohne Pfeil: „a X R“ (Bewegung auch klein), Stackregeln ebenso:
 * „a Z AZ“ oder „a, Z, AZ“ (Eingabe, Top of Stack, Push), Mealy-Regeln als „a 0“.
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
 * „AB“. Wer formatiert und wieder einliest, muss Γ deshalb mitgeben. Ergäbe die Verkettung
 * eine Schreibweise von ε („eps“, „Epsilon“), bleiben die Symbole getrennt („e p s“).
 */
export function formatStackWord(symbols: string[], stackAlphabet?: string[]): string {
  if (symbols.length === 0) return EPSILON
  const text = joinWord(symbols, stackAlphabet)
  return normalizeSymbol(text) === EPSILON ? symbols.join(' ') : text
}

/** Stackinhalt (oben = letztes Element) wie im Lehrbuch: oberstes Symbol links. */
export function formatStack(stack: string[], stackAlphabet?: string[]): string {
  return formatStackWord([...stack].reverse(), stackAlphabet)
}

/**
 * Wort aus Symbolen, z. B. die Ausgabe eines Transduktors: „01“, leer „ε“, Mehrzeichen-Symbole
 * mit Leerzeichen getrennt. Δ wie Γ bei `formatStackWord`.
 */
export const formatWord = formatStackWord

/** Wort aus Text: „01“, „x1 x2“, „ε“/„“ → []. Längstes Symbol aus `alphabet` zuerst. */
export const parseWord = parseStackWord

/** Moore-Automat: Zustand mit Ausgabe wie im Lehrbuch „q0/1“ – sonst nur der Name. */
export function stateText(state: StateNode, document: AutomatonDocument): string {
  if (!outputsOnStates(document.type)) return state.label
  return `${state.label}/${formatWord(stateOutput(state), outputSettings(document).alphabet)}`
}

/**
 * Gegenstück zu `stateText`: „q0/1“ → Name und Ausgabe. Auch der Name darf „/“ enthalten
 * („q/AB/1“), getrennt wird deshalb am letzten „/“, hinter dem nur Symbole aus Δ (oder ε) stehen,
 * sonst am ersten. Ohne „/“ fehlt `output` – die Ausgabe bleibt dann, wie sie ist.
 */
export function parseStateText(
  text: string,
  document: AutomatonDocument
): { label: string; output?: string[] } {
  const slashes: number[] = []
  if (outputsOnStates(document.type)) {
    for (let i = text.indexOf('/'); i !== -1; i = text.indexOf('/', i + 1)) slashes.push(i)
  }
  if (slashes.length === 0) return { label: text.trim() }
  const delta = outputSettings(document).alphabet
  const outputAfter = (slash: number): string[] => parseWord(text.slice(slash + 1), delta)
  let at = slashes[0]
  for (let k = slashes.length - 1; k >= 0; k--) {
    if (outputAfter(slashes[k]).every((symbol) => delta.includes(symbol))) {
      at = slashes[k]
      break
    }
  }
  return { label: text.slice(0, at).trim(), output: outputAfter(at) }
}

/**
 * Alphabet, mit dem Wörter auf der rechten Seite einer Regel formatiert werden: Γ beim
 * Kellerautomaten (Push), Δ beim Mealy-Automaten (Ausgabe).
 */
export function labelWordAlphabet(document: AutomatonDocument): string[] | undefined {
  if (usesOutput(document.type)) return outputSettings(document).alphabet
  return document.stack?.alphabet
}

/**
 * Eine Regel als Text – Γ bzw. Δ wie bei `formatStackWord`, damit das Push- bzw. Ausgabewort
 * eindeutig bleibt.
 */
export function formatLabel(label: TransitionLabel, stackAlphabet?: string[]): string {
  if (label.output !== undefined) return `${label.read}/${formatWord(label.output, stackAlphabet)}`
  if (isTuringLabel(label)) {
    const { read, write, move } = asTuring(label)
    return `${read} → ${write}, ${move}`
  }
  if (label.pop === undefined) return label.read
  return `${label.read}, ${label.pop} → ${formatStackWord(label.push ?? [], stackAlphabet)}`
}

/** Regeln, die in eine Zeile passen: reine Symbole (endliche Automaten) und Mealy-Regeln „a/0“ */
const isSymbolOnly = (labels: TransitionLabel[]): boolean =>
  labels.every((l) => l.pop === undefined && !isTuringLabel(l))

/**
 * Zeilen der Beschriftung im Graphen: Symbole und Mealy-Regeln in einer Zeile, Stack- und
 * Bandregeln je eine Zeile.
 */
export function labelLines(labels: TransitionLabel[], stackAlphabet?: string[]): string[] {
  if (labels.length === 0) return []
  if (isSymbolOnly(labels)) return [labels.map((l) => formatLabel(l, stackAlphabet)).join(', ')]
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
function parseShortTuringRule(
  text: string,
  blank: string,
  tapeAlphabet: readonly string[]
): TransitionLabel | null {
  const parts = text.split(/[\s,]+/).filter(Boolean)
  if (parts.length < 2 || parts.length > 3) return null
  const move = parseMove(parts.at(-1) ?? '')
  if (!move) return null
  const read = normalizeTapeSymbol(parts[0], blank, tapeAlphabet)
  const write = parts.length === 3 ? normalizeTapeSymbol(parts[1], blank, tapeAlphabet) : read
  return { read, write, move }
}

/**
 * Eine Turingregel „a → X, R“ oder kurz „a X R“ – `null`, wenn der Text keine Regel ist.
 * „a → R“ bzw. „a R“ schreibt das gelesene Symbol zurück, eine leere Leseseite oder „_“ meint
 * das Blank – außer „_“ steht selbst in Γ. Die Bewegung darf auch klein geschrieben sein.
 */
export function parseTuringRule(
  text: string,
  blank: string,
  tapeAlphabet: readonly string[] = []
): TransitionLabel | null {
  const match = TURING_RULE.exec(text.trim())
  if (!match) return parseShortTuringRule(text, blank, tapeAlphabet)
  const read = normalizeTapeSymbol(match[1], blank, tapeAlphabet) || blank
  const parts = match[2].split(',').map((p) => p.trim())
  if (parts.length > 2 || /\s/.test(read)) return null
  const move = parseMove(parts.at(-1) ?? '')
  if (!move) return null
  const write =
    parts.length === 2 ? normalizeTapeSymbol(parts[0], blank, tapeAlphabet) || blank : read
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

const MEALY_RULE = /^([^→/]*?)(?:→|->|\/)(.*)$/

/**
 * Eine Mealy-Regel „a/01“ (auch „a → 01“) oder kurz „a 01“ – lies a, gib 01 aus. Ohne Ausgabe
 * („a“, „a/“) ist die Ausgabe ε. `null`, wenn der Text keine Regel ist.
 */
export function parseMealyRule(text: string, outputAlphabet: string[]): TransitionLabel | null {
  const match = MEALY_RULE.exec(text.trim())
  const parts = text.trim().split(/\s+/)
  const [readText, outputText] = match ? [match[1], match[2]] : [parts[0], parts.slice(1).join(' ')]
  const read = normalizeSymbol(readText)
  if (read === '' || /\s/.test(read)) return null
  return { read, output: parseWord(outputText, outputAlphabet) }
}

/**
 * Neue Mealy-Regel für einen Zustand: das erste Symbol aus Σ, das der Zustand noch nicht liest,
 * mit Ausgabe ε. `null`, wenn alle belegt sind.
 */
export function nextMealyLabel(
  stateRules: TransitionLabel[],
  alphabet: string[]
): TransitionLabel | null {
  const read = alphabet.find((s) => !stateRules.some((l) => l.read === s))
  return read === undefined ? null : { read, output: [] }
}

/** Bandinhalt mit Kopf in eckigen Klammern: „Xa[a]bb“ (Mehrzeichen-Symbole mit Leerzeichen). */
export function formatTape(tape: TapeSnapshot, head: number): string {
  const separator = tape.symbols.some((s) => s.length > 1) ? ' ' : ''
  return tape.symbols.map((s, i) => (tape.start + i === head ? `[${s}]` : s)).join(separator)
}

export type LabelParseResult = { labels: TransitionLabel[] } | { error: string }

/** Eingegebene Beschriftung → Regeln, passend zum Typ des Dokuments (ohne Duplikate). */
export function parseLabels(text: string, document: AutomatonDocument): LabelParseResult {
  if (document.type === 'MEALY') return parseMealyLabels(text, document)
  const tape = usesTape(document.type)
  if (!tape && !usesStack(document.type)) return { labels: symbolLabels(parseSymbols(text)) }
  const stackAlphabet = stackSettings(document).alphabet
  const { blank, alphabet: tapeAlphabet } = tapeSettings(document)
  const labels: TransitionLabel[] = []
  for (const rule of text.split(/[;\n]/).map((r) => r.trim()).filter(Boolean)) {
    const label = tape
      ? parseTuringRule(rule, blank, tapeAlphabet)
      : parsePushdownRule(rule, stackAlphabet)
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

/** Mealy-Regeln, getrennt durch Komma, Semikolon oder Zeilenumbruch: „a/0, b/11“ */
function parseMealyLabels(text: string, document: AutomatonDocument): LabelParseResult {
  const delta = outputSettings(document).alphabet
  const labels: TransitionLabel[] = []
  for (const rule of text.split(/[,;\n]/).map((r) => r.trim()).filter(Boolean)) {
    const label = parseMealyRule(rule, delta)
    if (!label) return { error: `„${rule}“ ist keine Mealy-Regel (a/0)` }
    if (!labels.some((l) => labelKey(l) === labelKey(label))) labels.push(label)
  }
  return { labels }
}

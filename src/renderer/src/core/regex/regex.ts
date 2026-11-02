import { SYMBOL_SEPARATOR } from '@shared/alphabetRules'
import { EPSILON } from '@/model/graph'

/**
 * Regulärer Ausdruck als Syntaxbaum.
 *
 *   ∅            leere Sprache
 *   ε            nur das leere Wort
 *   a            ein Symbol
 *   r + s        Vereinigung (Eingabe auch mit | oder ∪)
 *   r s          Verkettung
 *   r*           Kleene-Stern
 *   \(           ein Symbol, das sonst ein Operator wäre (Maskierung mit \)
 */
export type Regex =
  | { kind: 'empty' }
  | { kind: 'epsilon' }
  | { kind: 'symbol'; symbol: string }
  | { kind: 'union'; parts: Regex[] }
  | { kind: 'concat'; parts: Regex[] }
  | { kind: 'star'; inner: Regex }

export const EMPTY_SET = '∅'

export const empty: Regex = { kind: 'empty' }
export const epsilon: Regex = { kind: 'epsilon' }
export const symbol = (s: string): Regex => ({ kind: 'symbol', symbol: s })

// --- Konstruktoren, die gleich vereinfachen ---------------------------------------
// So bleibt das Ergebnis der Zustandselimination lesbar (z. B. ε·a = a, ∅|r = r).

/** Aufbau eines zusammengesetzten Ausdrucks (Schlüssel der Teile) → kurzer Schlüssel „#n“ */
const structureKeys = new Map<string, string>()
let nextStructure = 0
/** Schlüssel pro Knoten – Teilausdrücke werden geteilt, jeder wird nur einmal berechnet */
const nodeKeys = new WeakMap<Regex, string>()

/**
 * Eindeutiger Schlüssel für den Aufbau eines Ausdrucks: gleicher Baum ↔ gleicher Schlüssel.
 * Nicht die Ausgabe von `formatRegex` – dort sehen das Symbol „ab“ und die Folge a·b gleich aus.
 *
 * Zusammengesetzte Ausdrücke bekommen eine laufende Nummer statt ihres ganzen Aufbaus als Text:
 * Die Zustandselimination verwendet Teilausdrücke vielfach wieder, ausgeschrieben würden die
 * Schlüssel exponentiell lang. Die Nummern wachsen nur, darum darf die Tabelle geleert werden –
 * danach bekommt ein gleicher Aufbau höchstens eine neue Nummer (es fällt dann eine
 * Vereinfachung weg), zwei verschiedene nie dieselbe.
 */
export function regexKey(regex: Regex): string {
  const cached = nodeKeys.get(regex)
  if (cached !== undefined) return cached
  let key: string
  switch (regex.kind) {
    case 'empty':
    case 'epsilon':
      return regex.kind
    case 'symbol':
      return JSON.stringify(regex.symbol)
    case 'union':
    case 'concat':
      key = structureKey(`${regex.kind}(${regex.parts.map(regexKey).join(',')})`)
      break
    case 'star':
      key = structureKey(`star(${regexKey(regex.inner)})`)
      break
  }
  nodeKeys.set(regex, key)
  return key
}

function structureKey(structure: string): string {
  const known = structureKeys.get(structure)
  if (known !== undefined) return known
  if (structureKeys.size >= 100_000) structureKeys.clear()
  const key = `#${nextStructure++}`
  structureKeys.set(structure, key)
  return key
}

const lengths = new WeakMap<Regex, number>()

/**
 * Länge von `formatRegex(regex)` in UTF-16-Einheiten, ohne den Ausdruck auszuschreiben (jeder
 * geteilte Teilausdruck wird einmal gezählt und gemerkt). Zählt in jeder Verkettung die
 * Leerzeichen mit, die nur bei Mehrzeichen-Symbolen nötig sind – ist also höchstens zu groß.
 */
export function regexLength(regex: Regex): number {
  const cached = lengths.get(regex)
  if (cached !== undefined) return cached
  const inner = (p: Regex, minPrecedence: number): number =>
    regexLength(p) + (PRECEDENCE[p.kind] < minPrecedence ? 2 : 0)
  let length: number
  switch (regex.kind) {
    case 'empty':
    case 'epsilon':
      return 1
    case 'symbol':
      return escapeSymbol(regex.symbol).length
    case 'union':
    case 'concat': {
      const min = regex.kind === 'union' ? 1 : 2
      length = regex.parts.reduce((sum, p) => sum + inner(p, min), regex.parts.length - 1)
      break
    }
    case 'star':
      length = inner(regex.inner, 3) + 1
      break
  }
  lengths.set(regex, length)
  return length
}

/** r | s – ohne ∅, ohne Duplikate, verschachtelte Vereinigungen flach */
export function union(...items: Regex[]): Regex {
  const parts: Regex[] = []
  const seen = new Set<string>()
  for (const item of items.flatMap((r) => (r.kind === 'union' ? r.parts : [r]))) {
    if (item.kind === 'empty') continue
    const key = regexKey(item)
    if (seen.has(key)) continue
    seen.add(key)
    parts.push(item)
  }
  // ε | r* = r*  (r* enthält ε schon)
  if (parts.some((p) => p.kind === 'star')) {
    const withoutEpsilon = parts.filter((p) => p.kind !== 'epsilon')
    parts.splice(0, parts.length, ...withoutEpsilon)
  }
  if (parts.length === 0) return empty
  if (parts.length === 1) return parts[0]
  // ε ans Ende: „a+ε“ liest sich besser als „ε+a“
  parts.sort((a, b) => Number(a.kind === 'epsilon') - Number(b.kind === 'epsilon'))
  return { kind: 'union', parts }
}

/** r s – ∅ verschluckt alles, ε fällt weg, verschachtelte Verkettungen flach */
export function concat(...items: Regex[]): Regex {
  const parts: Regex[] = []
  for (const item of items.flatMap((r) => (r.kind === 'concat' ? r.parts : [r]))) {
    if (item.kind === 'empty') return empty
    if (item.kind !== 'epsilon') parts.push(item)
  }
  if (parts.length === 0) return epsilon
  if (parts.length === 1) return parts[0]
  return { kind: 'concat', parts }
}

/** r* – ∅* = ε* = ε, (r*)* = r*, (ε|r)* = r* */
export function star(inner: Regex): Regex {
  if (inner.kind === 'empty' || inner.kind === 'epsilon') return epsilon
  if (inner.kind === 'star') return inner
  if (inner.kind === 'union' && inner.parts.some((p) => p.kind === 'epsilon')) {
    return star(union(...inner.parts.filter((p) => p.kind !== 'epsilon')))
  }
  return { kind: 'star', inner }
}

// --- Ausgabe -----------------------------------------------------------------------

/** Bindungsstärke: Stern > Verkettung > Vereinigung */
const PRECEDENCE: Record<Regex['kind'], number> = {
  union: 0,
  concat: 1,
  star: 2,
  symbol: 3,
  epsilon: 3,
  empty: 3
}

/** Ein Stück der Ausgabe – `sup` = hochgestellt darstellen (der Kleene-Stern) */
export interface RegexPart {
  text: string
  sup?: boolean
}

export const UNION_SYMBOL = '+'

const ESCAPE = '\\'
const UNION_CHARS = new Set(['|', UNION_SYMBOL, '∪'])
/** Zeichen mit eigener Bedeutung im Ausdruck – in einem Symbol werden sie maskiert */
const SPECIAL = new Set(['(', ')', '*', EPSILON, EMPTY_SET, ESCAPE, ...UNION_CHARS])

/**
 * Schreibweise eines Symbols im Ausdruck: Operator-Zeichen, \ und Leerraum bekommen ein \
 * davor, z. B. „(“ → „\(“, „a+“ → „a\+“. Gewöhnliche Symbole bleiben, wie sie sind.
 */
export function escapeSymbol(symbol: string): string {
  return [...symbol].map((c) => (SPECIAL.has(c) || /\s/.test(c) ? ESCAPE + c : c)).join('')
}

/**
 * Ausgabe in Stücken, damit die Oberfläche den Stern hochstellen kann.
 *
 * Hat ein Symbol (aus `alphabet` oder dem Ausdruck) mehrere Zeichen, stehen zwischen den Teilen
 * einer Verkettung Leerzeichen – sonst liest `parseRegex` z. B. „a“ „b“ bei Σ = {a, b, ab} als
 * das eine Symbol „ab“.
 *
 * Die Stücke entstehen erst beim Durchlaufen: Wer nur den Anfang braucht (`compactRegexParts`
 * mit Grenze), schreibt den Rest nie aus.
 */
export function* regexParts(regex: Regex, alphabet: string[] = []): Generator<RegexPart> {
  const separate = [...alphabet, ...regexSymbols(regex)].some((s) => [...s].length > 1)
  function* inner(p: Regex, minPrecedence: number): Generator<RegexPart> {
    const parens = PRECEDENCE[p.kind] < minPrecedence
    if (parens) yield { text: '(' }
    yield* format(p)
    if (parens) yield { text: ')' }
  }
  function* format(r: Regex): Generator<RegexPart> {
    switch (r.kind) {
      case 'empty':
        yield { text: EMPTY_SET }
        return
      case 'epsilon':
        yield { text: EPSILON }
        return
      case 'symbol':
        yield { text: escapeSymbol(r.symbol) }
        return
      case 'union':
        for (const [i, p] of r.parts.entries()) {
          if (i > 0) yield { text: UNION_SYMBOL }
          yield* inner(p, 1)
        }
        return
      case 'concat':
        for (const [i, p] of r.parts.entries()) {
          if (i > 0 && separate) yield { text: ' ' }
          yield* inner(p, 2)
        }
        return
      case 'star':
        yield* inner(r.inner, 3)
        yield { text: '*', sup: true }
    }
  }
  yield* format(regex)
}

/** Alle Stücke der Ausgabe (`regexParts`) als Liste */
export function formatRegexParts(regex: Regex, alphabet: string[] = []): RegexPart[] {
  return [...regexParts(regex, alphabet)]
}

/** Text mit möglichst wenigen Klammern, z. B. „(a+b)*ab“ oder „x1 x2*“. */
export function formatRegex(regex: Regex, alphabet: string[] = []): string {
  let text = ''
  for (const part of regexParts(regex, alphabet)) text += part.text
  return text
}

/**
 * Teile für die Anzeige: aufeinanderfolgender normaler Text als ein Stück, höchstens `limit`
 * Zeichen – ein längerer Ausdruck endet mit „…“ (`truncated`). Liest `parts` nur so weit wie
 * nötig.
 */
export function compactRegexParts(
  parts: Iterable<RegexPart>,
  limit = Infinity
): { parts: RegexPart[]; truncated: boolean } {
  const result: RegexPart[] = []
  let length = 0
  for (const part of parts) {
    if (length + part.text.length > limit) {
      result.push({ text: '…' })
      return { parts: result, truncated: true }
    }
    length += part.text.length
    const last = result.at(-1)
    if (last && !last.sup && !part.sup) last.text += part.text
    else result.push({ ...part })
  }
  return { parts: result, truncated: false }
}

/** Alle Symbole, die im Ausdruck vorkommen – jeder geteilte Teilausdruck wird einmal besucht */
export function regexSymbols(regex: Regex): Set<string> {
  const symbols = new Set<string>()
  const visited = new Set<Regex>()
  const todo = [regex]
  while (todo.length > 0) {
    const r = todo.pop() as Regex
    if (visited.has(r)) continue
    visited.add(r)
    if (r.kind === 'symbol') symbols.add(r.symbol)
    else if (r.kind === 'star') todo.push(r.inner)
    // Rückwärts auf den Stapel: Symbole kommen in Lesereihenfolge heraus
    else if (r.kind === 'union' || r.kind === 'concat') todo.push(...[...r.parts].reverse())
  }
  return symbols
}

// --- Parser ------------------------------------------------------------------------

const SEPARATOR_MESSAGE = 'Leerzeichen, Komma und Semikolon sind keine Symbole'

export class RegexSyntaxError extends Error {
  constructor(
    message: string,
    /** Stelle im Eingabetext (0-basiert) */
    readonly position: number
  ) {
    super(message)
    this.name = 'RegexSyntaxError'
  }
}


/**
 * Liest einen regulären Ausdruck.
 *
 * Grammatik:   union  := concat (('+' | '|' | '∪') concat)*
 *              concat := starred starred*
 *              starred:= atom '*'*
 *              atom   := '(' union ')' | 'ε' | '∅' | Symbol
 *
 * Symbole aus `alphabet` dürfen mehrere Zeichen haben (längstes zuerst), alle anderen
 * Zeichen gelten einzeln als Symbol. Leerzeichen werden ignoriert. Symbole stehen in der
 * Schreibweise von `escapeSymbol`: `\(` ist das Symbol „(“, allgemein `\x` das Zeichen x.
 */
export function parseRegex(input: string, alphabet: string[] = []): Regex {
  // ε ist nie ein Symbol – auch nicht, wenn eine importierte Datei es in Σ hat
  const spellings = alphabet
    .filter((s) => s !== '' && s !== EPSILON)
    .map((s) => ({ symbol: s, text: escapeSymbol(s) }))
    .sort((a, b) => b.text.length - a.text.length)
  let pos = 0

  const skipSpaces = (): void => {
    while (pos < input.length && /\s/.test(input[pos])) pos++
  }
  const peek = (): string | undefined => {
    skipSpaces()
    return input[pos]
  }
  const fail = (message: string, at = pos): never => {
    throw new RegexSyntaxError(`${message} (Stelle ${at + 1})`, at)
  }

  const parseUnion = (): Regex => {
    const parts = [parseConcat()]
    while (peek() !== undefined && UNION_CHARS.has(peek() as string)) {
      pos++
      parts.push(parseConcat())
    }
    return union(...parts)
  }

  const parseConcat = (): Regex => {
    const parts: Regex[] = []
    for (let c = peek(); c !== undefined && c !== ')' && !UNION_CHARS.has(c); c = peek()) {
      parts.push(parseStarred())
    }
    if (parts.length === 0) fail('Ausdruck erwartet')
    return concat(...parts)
  }

  const parseStarred = (): Regex => {
    let result = parseAtom()
    while (peek() === '*') {
      pos++
      result = star(result)
    }
    return result
  }

  const parseAtom = (): Regex => {
    const c = peek() as string
    if (c === '(') {
      const open = pos
      pos++
      const inner = parseUnion()
      if (peek() !== ')') fail('Klammer „(“ wird nicht geschlossen', open)
      pos++
      return inner
    }
    if (c === '*') fail('„*“ ohne Ausdruck davor')
    if (c === EPSILON) {
      pos++
      return epsilon
    }
    if (c === EMPTY_SET) {
      pos++
      return empty
    }
    const known = spellings.find((s) => input.startsWith(s.text, pos))
    if (known) {
      pos += known.text.length
      return symbol(known.symbol)
    }
    if (c === ESCAPE) {
      const escaped = input.codePointAt(pos + 1)
      if (escaped === undefined) return fail(`„${ESCAPE}“ ohne Zeichen danach`)
      const text = String.fromCodePoint(escaped)
      // ε liegt nie in Σ – als Symbol würde es im NEA zum ε-Übergang
      if (text === EPSILON) fail(`„${ESCAPE}${EPSILON}“: ε ist kein Symbol`)
      // Wie im Alphabeteditor: Trennzeichen ließen sich weder eingeben noch beschriften
      if (SYMBOL_SEPARATOR.test(text)) fail(SEPARATOR_MESSAGE)
      pos += 1 + text.length
      return symbol(text)
    }
    if (SPECIAL.has(c)) fail(`Unerwartetes Zeichen „${c}“`)
    if (SYMBOL_SEPARATOR.test(c)) fail(SEPARATOR_MESSAGE)
    // Ganzes Zeichen, nicht nur eine UTF-16-Hälfte – sonst bindet „😀*“ den Stern falsch
    const text = String.fromCodePoint(input.codePointAt(pos) as number)
    pos += text.length
    return symbol(text)
  }

  if (peek() === undefined) fail('Ausdruck erwartet')
  const result = parseUnion()
  if (peek() !== undefined) fail(`Unerwartetes Zeichen „${peek()}“`)
  return result
}

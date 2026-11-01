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

/**
 * Eindeutiger Schlüssel für den Aufbau eines Ausdrucks: gleicher Baum ↔ gleicher Schlüssel.
 * Nicht die Ausgabe von `formatRegex` – dort sehen das Symbol „ab“ und die Folge a·b gleich aus.
 */
export function regexKey(regex: Regex): string {
  switch (regex.kind) {
    case 'empty':
    case 'epsilon':
      return regex.kind
    case 'symbol':
      return JSON.stringify(regex.symbol)
    case 'union':
    case 'concat':
      return `${regex.kind}(${regex.parts.map(regexKey).join(',')})`
    case 'star':
      return `star(${regexKey(regex.inner)})`
  }
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
 */
export function formatRegexParts(regex: Regex, alphabet: string[] = []): RegexPart[] {
  const separate = [...alphabet, ...regexSymbols(regex)].some((s) => [...s].length > 1)
  const format = (r: Regex): RegexPart[] => {
    const inner = (p: Regex, minPrecedence: number): RegexPart[] => {
      const parts = format(p)
      return PRECEDENCE[p.kind] < minPrecedence ? [{ text: '(' }, ...parts, { text: ')' }] : parts
    }
    switch (r.kind) {
      case 'empty':
        return [{ text: EMPTY_SET }]
      case 'epsilon':
        return [{ text: EPSILON }]
      case 'symbol':
        return [{ text: escapeSymbol(r.symbol) }]
      case 'union':
        return r.parts.flatMap((p, i) => [
          ...(i > 0 ? [{ text: UNION_SYMBOL }] : []),
          ...inner(p, 1)
        ])
      case 'concat':
        return r.parts.flatMap((p, i) => [
          ...(i > 0 && separate ? [{ text: ' ' }] : []),
          ...inner(p, 2)
        ])
      case 'star':
        return [...inner(r.inner, 3), { text: '*', sup: true }]
    }
  }
  return format(regex)
}

/** Text mit möglichst wenigen Klammern, z. B. „(a+b)*ab“ oder „x1 x2*“. */
export function formatRegex(regex: Regex, alphabet: string[] = []): string {
  return formatRegexParts(regex, alphabet)
    .map((p) => p.text)
    .join('')
}

/** Alle Symbole, die im Ausdruck vorkommen */
export function regexSymbols(regex: Regex): Set<string> {
  switch (regex.kind) {
    case 'symbol':
      return new Set([regex.symbol])
    case 'union':
    case 'concat':
      return new Set(regex.parts.flatMap((p) => [...regexSymbols(p)]))
    case 'star':
      return regexSymbols(regex.inner)
    default:
      return new Set()
  }
}

// --- Parser ------------------------------------------------------------------------

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
  const spellings = alphabet
    .filter((s) => s !== '')
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
      pos += 1 + text.length
      return symbol(text)
    }
    if (SPECIAL.has(c)) fail(`Unerwartetes Zeichen „${c}“`)
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

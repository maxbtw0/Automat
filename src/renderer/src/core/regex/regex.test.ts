import { describe, expect, it } from 'vitest'
import {
  compactRegexParts,
  concat,
  epsilon,
  formatRegex,
  formatRegexParts,
  parseRegex,
  regexLength,
  regexParts,
  regexSymbols,
  star,
  symbol,
  union,
  type Regex
} from './regex'

const roundtrip = (input: string, alphabet?: string[]): string =>
  formatRegex(parseRegex(input, alphabet))

describe('parseRegex + formatRegex', () => {
  it('liest Vereinigung, Verkettung, Stern und Klammern', () => {
    expect(roundtrip('(a|b)*ab')).toBe('(a+b)*ab')
    expect(roundtrip('a(b|c)')).toBe('a(b+c)')
    expect(roundtrip('(ab)*')).toBe('(ab)*')
  })

  it('akzeptiert +, | und ∪ als Vereinigung und ignoriert Leerzeichen', () => {
    expect(roundtrip('a + b')).toBe('a+b')
    expect(roundtrip('a | b')).toBe('a+b')
    expect(roundtrip('a ∪ b')).toBe('a+b')
  })

  it('entfernt überflüssige Klammern', () => {
    expect(roundtrip('((a))((b))')).toBe('ab')
    expect(roundtrip('(a)*')).toBe('a*')
    expect(roundtrip('(a|b)|c')).toBe('a+b+c')
  })

  it('kennt ε und ∅', () => {
    expect(roundtrip('aε')).toBe('a')
    expect(roundtrip('a∅')).toBe('∅')
    expect(roundtrip('a|ε')).toBe('a+ε')
    expect(roundtrip('∅*')).toBe('ε')
  })

  it('liest Symbole mit mehreren Zeichen aus dem Alphabet', () => {
    const r = parseRegex('x1x*', ['x', 'x1'])
    expect(r).toEqual(concat(symbol('x1'), star(symbol('x'))))
  })

  it('meldet Syntaxfehler mit Stelle', () => {
    expect(() => parseRegex('')).toThrow('Ausdruck erwartet')
    expect(() => parseRegex('(ab')).toThrow('Klammer „(“ wird nicht geschlossen (Stelle 1)')
    expect(() => parseRegex('a)')).toThrow('Unerwartetes Zeichen „)“ (Stelle 2)')
    expect(() => parseRegex('*a')).toThrow('„*“ ohne Ausdruck davor')
    expect(() => parseRegex('a|')).toThrow('Ausdruck erwartet')
  })
})

describe('formatRegexParts', () => {
  it('stellt nur den Stern hoch', () => {
    expect(formatRegexParts(parseRegex('(a+b)*a'))).toEqual([
      { text: '(' },
      { text: 'a' },
      { text: '+' },
      { text: 'b' },
      { text: ')' },
      { text: '*', sup: true },
      { text: 'a' }
    ])
  })
})

describe('compactRegexParts', () => {
  it('fasst normalen Text zusammen und kürzt lange Ausdrücke', () => {
    const parts = formatRegexParts(parseRegex('(a+b)*a'))
    expect(compactRegexParts(parts)).toEqual({
      parts: [{ text: '(a+b)' }, { text: '*', sup: true }, { text: 'a' }],
      truncated: false
    })
    expect(compactRegexParts(parts, 4)).toEqual({
      parts: [{ text: '(a+b' }, { text: '…' }],
      truncated: true
    })
  })
})

describe('regexLength und regexParts', () => {
  it('regexLength stimmt mit der Ausgabe überein, ohne sie zu bauen', () => {
    const alphabet = ['a', 'b', 'ab']
    for (const input of ['(a+b)*a', 'a b*+ε', '(ab+a)* b', '∅', '\\(*']) {
      const r = parseRegex(input, alphabet)
      expect(regexLength(r), input).toBe(formatRegex(r, alphabet).length)
      expect(regexLength(r), input).toBeGreaterThanOrEqual(formatRegex(r).length)
    }
  })

  it('geteilte Teilausdrücke: Länge exponentiell, Vorschau liest nur den Anfang', () => {
    // r(k+1) = (r(k) + r(k)·a) – als Baum ausgeschrieben 2^k-mal so groß, geteilt nur k Knoten
    let r: Regex = symbol('a')
    for (let k = 0; k < 60; k++) r = union(r, concat(r, symbol('b')))
    expect(regexLength(r)).toBeGreaterThan(2 ** 60)
    const preview = compactRegexParts(regexParts(r), 100)
    expect(preview.truncated).toBe(true)
    expect(preview.parts.map((p) => p.text).join('').length).toBeLessThanOrEqual(101)
    expect(regexSymbols(r)).toEqual(new Set(['a', 'b']))
  })
})

describe('vereinfachende Konstruktoren', () => {
  it('union entfernt Duplikate und ε neben einem Stern', () => {
    expect(formatRegex(union(symbol('a'), symbol('a')))).toBe('a')
    expect(formatRegex(union(epsilon, star(symbol('a'))))).toBe('a*')
  })

  it('star vereinfacht (ε|a)* zu a*', () => {
    expect(formatRegex(star(union(epsilon, symbol('a'))))).toBe('a*')
    expect(formatRegex(star(star(symbol('a'))))).toBe('a*')
  })
})

describe('Symbole mit Operator-Zeichen', () => {
  it('maskiert Operator-Zeichen in Symbolen mit \\', () => {
    expect(formatRegex(symbol('('))).toBe('\\(')
    expect(formatRegex(concat(symbol('a+'), star(symbol('*'))))).toBe('a\\+ \\**')
    expect(formatRegex(symbol('x1'))).toBe('x1')
  })

  it('liest maskierte Symbole wieder ein (Hin- und Rückweg)', () => {
    const alphabet = ['(', ')', '+', 'a+', '\\']
    for (const s of alphabet) {
      expect(parseRegex(formatRegex(symbol(s)), alphabet)).toEqual(symbol(s))
    }
    const r = union(concat(symbol('('), star(symbol('a+'))), symbol(')'))
    expect(parseRegex(formatRegex(r), alphabet)).toEqual(r)
  })

  it('trennt verkettete Symbole, wenn ein Symbol mehrere Zeichen hat', () => {
    const alphabet = ['a', 'b', 'ab']
    const r = concat(symbol('a'), star(symbol('b')))
    expect(formatRegex(r)).toBe('ab*')
    expect(formatRegex(r, alphabet)).toBe('a b*')
    expect(parseRegex(formatRegex(r, alphabet), alphabet)).toEqual(r)
    const both = union(concat(symbol('a'), symbol('b')), symbol('ab'))
    expect(formatRegex(both, alphabet)).toBe('a b+ab')
    expect(parseRegex(formatRegex(both, alphabet), alphabet)).toEqual(both)
  })

  it('\\x ist auch ohne Alphabet das Zeichen x, ein einzelnes \\ am Ende ist ein Fehler', () => {
    expect(parseRegex('\\(a')).toEqual(concat(symbol('('), symbol('a')))
    expect(() => parseRegex('a\\')).toThrow('„\\“ ohne Zeichen danach')
  })

  it('\\ε ist ein Fehler: ε ist das leere Wort, kein Symbol', () => {
    expect(() => parseRegex('a\\ε')).toThrow('ε ist kein Symbol')
  })

  it('\\ε bleibt ein Fehler, auch wenn ε (aus einer Datei) in Σ liegt', () => {
    expect(() => parseRegex('\\ε', ['ε'])).toThrow('ε ist kein Symbol')
    expect(parseRegex('ε', ['ε'])).toEqual(parseRegex('ε'))
  })

  it('Leerzeichen, Komma und Semikolon sind keine Symbole – auch nicht maskiert', () => {
    for (const input of ['\\ ', 'a\\\t', ',', 'a;b', '\\,']) {
      expect(() => parseRegex(input), input).toThrow('keine Symbole')
    }
  })

  it('liest Zeichen außerhalb der Basisebene als ein Symbol (Emoji)', () => {
    expect(parseRegex('😀*')).toEqual(star(symbol('😀')))
    expect(parseRegex('a😀')).toEqual(concat(symbol('a'), symbol('😀')))
  })

  it('ungeschützte Klammern bleiben Klammern, auch wenn „(“ in Σ liegt', () => {
    expect(parseRegex('(a)', ['(', ')', 'a'])).toEqual(symbol('a'))
  })
})

describe('union vergleicht den Aufbau, nicht den Text', () => {
  it('das Symbol „ab“ und die Folge a·b bleiben verschieden', () => {
    const result = union(symbol('ab'), concat(symbol('a'), symbol('b')))
    expect(result).toEqual({
      kind: 'union',
      parts: [symbol('ab'), concat(symbol('a'), symbol('b'))]
    })
  })

  it('gleich aufgebaute Teile fallen weiterhin zusammen', () => {
    const ab = (): ReturnType<typeof concat> => concat(symbol('a'), symbol('b'))
    expect(union(ab(), ab())).toEqual(ab())
  })
})

import { describe, expect, it } from 'vitest'
import {
  concat,
  epsilon,
  formatRegex,
  formatRegexParts,
  parseRegex,
  star,
  symbol,
  union
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
    expect(formatRegex(concat(symbol('a+'), star(symbol('*'))))).toBe('a\\+\\**')
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

  it('\\x ist auch ohne Alphabet das Zeichen x, ein einzelnes \\ am Ende ist ein Fehler', () => {
    expect(parseRegex('\\(a')).toEqual(concat(symbol('('), symbol('a')))
    expect(() => parseRegex('a\\')).toThrow('„\\“ ohne Zeichen danach')
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

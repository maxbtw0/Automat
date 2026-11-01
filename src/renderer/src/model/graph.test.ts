import { describe, expect, it } from 'vitest'
import { EPSILON, nextFreeSymbol, parseSymbols, validateSymbol } from './graph'

describe('nextFreeSymbol', () => {
  it('beginnt bei a', () => {
    expect(nextFreeSymbol([])).toBe('a')
  })

  it('überspringt belegte Symbole', () => {
    expect(nextFreeSymbol(['a', 'b', 'd'])).toBe('c')
  })

  it('nimmt kein Zeichen, das in einem Mehrzeichen-Symbol steckt', () => {
    expect(nextFreeSymbol(['ab'])).toBe('c')
  })

  it('bleibt ein einzelnes Zeichen, wenn a–z und 0–9 belegt sind', () => {
    const full = [...'abcdefghijklmnopqrstuvwxyz0123456789']
    expect(nextFreeSymbol(full)).toBe('α')
    expect(nextFreeSymbol([...full, ...'αβγδζηθικλμνξοπρστυφχψω'])).toHaveLength(1)
  })
})

describe('validateSymbol', () => {
  it('akzeptiert ein neues Symbol', () => {
    expect(validateSymbol(['a'], 'b')).toBeNull()
  })

  it('lehnt leere Symbole und Trennzeichen ab', () => {
    expect(validateSymbol([], '')).not.toBeNull()
    expect(validateSymbol([], 'a b')).not.toBeNull()
    expect(validateSymbol([], 'a,b')).not.toBeNull()
  })

  it('lehnt Duplikate ab, außer beim Umbenennen auf sich selbst', () => {
    expect(validateSymbol(['a', 'b'], 'b', 'a')).not.toBeNull()
    expect(validateSymbol(['a', 'b'], 'a', 'a')).toBeNull()
  })

  it('kein Zeichen einzeln und zugleich in einem Mehrzeichen-Symbol', () => {
    expect(validateSymbol(['a', 'b'], 'ab')).toBe('„a“ gibt es schon einzeln')
    expect(validateSymbol(['ab'], 'b')).toBe('„b“ steckt in „ab“')
    expect(validateSymbol(['x1'], 'x2')).toBeNull()
    // Beim Umbenennen zählt das alte Symbol nicht mehr
    expect(validateSymbol(['a', 'c'], 'ab', 'a')).toBeNull()
  })
})

describe('ε-Eingabe', () => {
  it('parseSymbols macht aus eps/epsilon/ε das Zeichen ε', () => {
    expect(parseSymbols('a, eps; Epsilon ε')).toEqual(['a', EPSILON])
  })

  it('validateSymbol lehnt ε im Alphabet ab', () => {
    expect(validateSymbol([], 'ε')).not.toBeNull()
    expect(validateSymbol([], 'eps')).not.toBeNull()
  })
})

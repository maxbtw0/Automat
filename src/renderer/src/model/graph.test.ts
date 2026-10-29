import { describe, expect, it } from 'vitest'
import { EPSILON, nextFreeSymbol, parseSymbols, validateSymbol } from './graph'

describe('nextFreeSymbol', () => {
  it('beginnt bei a', () => {
    expect(nextFreeSymbol([])).toBe('a')
  })

  it('überspringt belegte Symbole', () => {
    expect(nextFreeSymbol(['a', 'b', 'd'])).toBe('c')
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

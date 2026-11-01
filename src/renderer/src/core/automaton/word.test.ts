import { describe, expect, it } from 'vitest'
import { joinWord, tokenizeWord } from './word'

describe('tokenizeWord', () => {
  it('nimmt an jeder Stelle das längste passende Symbol', () => {
    expect(tokenizeWord('x10x1', ['x1', 'x10'])).toEqual(['x10', 'x1'])
  })

  it('liest ein unbekanntes Zeichen einzeln', () => {
    expect(tokenizeWord('ab', ['a'])).toEqual(['a', 'b'])
  })

  it('übergeht ein leeres Symbol, statt endlos zu lesen', () => {
    expect(tokenizeWord('ab', ['', 'a', 'b'])).toEqual(['a', 'b'])
  })

  it('trennt Symbole an Leerzeichen', () => {
    expect(tokenizeWord('a b', ['a', 'b', 'ab'])).toEqual(['a', 'b'])
    expect(tokenizeWord('ab', ['a', 'b', 'ab'])).toEqual(['ab'])
    expect(tokenizeWord('  x1 x10x1  ', ['x1', 'x10'])).toEqual(['x1', 'x10', 'x1'])
    expect(tokenizeWord(' ', ['a'])).toEqual([])
  })

})

describe('joinWord', () => {
  it('trennt nur, wenn das Zusammenlesen andere Symbole ergäbe', () => {
    expect(joinWord(['a', 'b', 'b', 'a'], ['a', 'b'])).toBe('abba')
    expect(joinWord(['a', 'b'], ['a', 'b', 'ab'])).toBe('a b')
    expect(joinWord(['x1', 'x2'], ['x1', 'x2'])).toBe('x1 x2')
    expect(joinWord([], ['a'])).toBe('')
  })

  it('tokenizeWord liest zurück, was joinWord schreibt', () => {
    const alphabet = ['a', 'b', 'ab', 'bb']
    for (const word of [['a', 'bb'], ['ab', 'b'], ['a', 'b', 'ab'], ['bb', 'a']]) {
      expect(tokenizeWord(joinWord(word, alphabet), alphabet)).toEqual(word)
    }
  })
})

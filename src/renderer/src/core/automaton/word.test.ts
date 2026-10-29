import { describe, expect, it } from 'vitest'
import { tokenizeWord } from './word'

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
})

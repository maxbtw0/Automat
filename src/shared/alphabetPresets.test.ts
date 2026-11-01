import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ALPHABET_PRESETS,
  defaultAlphabetPresets,
  normalizeAlphabetPresets,
  presetProblem,
  splitPresetSymbols
} from './alphabetPresets'

// Schützt die Standardliste vor Tippfehlern.
describe.each(DEFAULT_ALPHABET_PRESETS)('Preset „$name“', ({ symbols }) => {
  it('ist nicht leer', () => {
    expect(symbols.length).toBeGreaterThan(0)
  })

  it('enthält keine Trennzeichen in Symbolen', () => {
    symbols.forEach((symbol) => {
      expect(splitPresetSymbols(symbol), `Symbol „${symbol}“`).toEqual([symbol])
    })
  })
})

describe('Alphabet-Presets', () => {
  it('Standardliste hat eindeutige Namen und keine Probleme', () => {
    const presets = defaultAlphabetPresets()
    presets.forEach((_, i) => expect(presetProblem(presets, i)).toBeNull())
  })

  it('Standard übersteht Laden unverändert', () => {
    expect(normalizeAlphabetPresets(defaultAlphabetPresets())).toEqual(defaultAlphabetPresets())
  })

  it('trennt Symbole wie der Alphabeteditor', () => {
    expect(splitPresetSymbols(' a, b c;d ')).toEqual(['a', 'b', 'c', 'd'])
    expect(splitPresetSymbols('')).toEqual([])
  })

  it('meldet Probleme kurz', () => {
    const p = (name: string, symbols: string[]) => ({ name, symbols })
    expect(presetProblem([p(' ', ['a'])], 0)).toBe('Name fehlt')
    expect(presetProblem([p('x', ['a']), p('x ', ['b'])], 1)).toBe('„x“ doppelt')
    expect(presetProblem([p('x', [])], 0)).toBe('Keine Symbole')
    expect(presetProblem([p('x', ['a', 'eps'])], 0)).toBe('ε ist kein Symbol')
    expect(presetProblem([p('x', ['a', 'b', 'a'])], 0)).toBe('„a“ doppelt')
    expect(presetProblem([p('x', ['a', 'b', 'ab'])], 0)).toBe('„a“ einzeln und in „ab“')
  })

  it('fehlende Liste wird zum Standard, ungültige Einträge fallen weg', () => {
    expect(normalizeAlphabetPresets(undefined)).toEqual(defaultAlphabetPresets())
    expect(normalizeAlphabetPresets([])).toEqual([])
    expect(
      normalizeAlphabetPresets([
        { name: ' Mein ', symbols: ['x', 'y', 'x', 'ε', 'a b', 3] },
        { name: 'Mein', symbols: ['z'] },
        { name: '', symbols: ['z'] },
        { name: 'Leer', symbols: ['ε'] },
        'Unsinn',
        { name: 'Zwei', symbols: ['0', '1'] }
      ])
    ).toEqual([
      { name: 'Mein', symbols: ['x', 'y'] },
      { name: 'Zwei', symbols: ['0', '1'] }
    ])
  })
})

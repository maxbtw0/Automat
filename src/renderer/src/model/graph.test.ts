import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_NEW_AUTOMATON } from '@shared/newAutomaton'
import { changeDocumentType } from '@/core/algorithms/changeType'
import { createAutomaton } from '@/core/automaton/registry'
import { buildDocument } from '@/core/automaton/testing'
import {
  EPSILON,
  createTapeSettings,
  nextFreeSymbol,
  parseSymbols,
  setDocumentDefaults,
  validateSymbol
} from './graph'

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

describe('createTapeSettings', () => {
  afterEach(() => setDocumentDefaults(DEFAULT_NEW_AUTOMATON))

  it('nimmt kein Blank, das in einem Symbol aus Σ steckt', () => {
    expect(createTapeSettings(['#1'])).toEqual({ alphabet: ['#1', '$'], blank: '$' })
  })

  it('überspringt ein mehrstelliges Blank aus den Vorgaben, das mit Σ überlappt', () => {
    setDocumentDefaults({ ...DEFAULT_NEW_AUTOMATON, blank: 'B1' })
    expect(createTapeSettings(['a', 'b']).blank).toBe('B1')
    expect(createTapeSettings(['1']).blank).toBe('#')
  })

  it('findet ein einzelnes Zeichen, wenn alle Ersatz-Blanks belegt sind', () => {
    const alphabet = ['#', '$', '§', '%', '&', '~']
    const { blank } = createTapeSettings(alphabet)
    expect(alphabet).not.toContain(blank)
    expect(blank).toHaveLength(1)
  })
})

describe('Typwechsel zur Turingmaschine', () => {
  it('ergibt bei Σ = {#1} eine gültige Maschine', () => {
    const doc = buildDocument('DFA', ['#1'], { start: 'q0' }, [['q0', '#1', 'q0']])
    const tm = changeDocumentType(doc, 'TM')
    expect(tm.tape?.blank).not.toBe('#')
    expect(createAutomaton(tm).validate().filter((i) => i.severity === 'error')).toEqual([])
  })
})

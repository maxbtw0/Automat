import { describe, expect, it } from 'vitest'
import { createEmptyDocument } from '@/model/graph'
import {
  formatLabel,
  formatLabelsInline,
  formatStack,
  formatStackWord,
  labelLines,
  parseLabels,
  parseStackWord,
  pushSuggestions
} from './labels'

const pda = (gamma: string[] = ['A', '#']) => {
  const doc = createEmptyDocument('NPDA')
  doc.stack = { alphabet: gamma, start: '#', acceptance: 'final' }
  return doc
}

describe('Stackregeln lesen', () => {
  it('versteht →, -> und / und „eps“', () => {
    for (const text of ['a, # → A#', 'a,#->A#', 'a , # / A #']) {
      expect(parseLabels(text, pda()), text).toEqual({
        labels: [{ read: 'a', pop: '#', push: ['A', '#'] }]
      })
    }
    expect(parseLabels('eps, A -> eps', pda())).toEqual({
      labels: [{ read: 'ε', pop: 'A', push: [] }]
    })
  })

  it('leere Felder sind ε', () => {
    expect(parseLabels(', # ->', pda())).toEqual({ labels: [{ read: 'ε', pop: '#', push: [] }] })
  })

  it('trennt mehrere Regeln mit Semikolon und entfernt Duplikate', () => {
    const result = parseLabels('a, # → A#; b, A → ε; a, # → A#', pda())
    expect(result).toEqual({
      labels: [
        { read: 'a', pop: '#', push: ['A', '#'] },
        { read: 'b', pop: 'A', push: [] }
      ]
    })
  })

  it('verlangt ein Top of Stack', () => {
    expect(parseLabels('a, ε → A', pda())).toEqual({ error: '„a, ε → A“: Top of Stack fehlt' })
    expect(parseLabels('a, → A', pda())).toEqual({ error: '„a, → A“: Top of Stack fehlt' })
  })

  it('versteht die Kurzform „Eingabe Top-of-Stack Push“ mit Leerzeichen oder Komma', () => {
    const doc = pda(['a', 'b', 'A', '#'])
    for (const text of ['a a b', 'a, a, b', 'a,a,b', 'a , a , b']) {
      expect(parseLabels(text, doc), text).toEqual({
        labels: [{ read: 'a', pop: 'a', push: ['b'] }]
      })
    }
    expect(parseLabels('a # A#', doc)).toEqual({
      labels: [{ read: 'a', pop: '#', push: ['A', '#'] }]
    })
    expect(parseLabels('a # A #', doc)).toEqual({
      labels: [{ read: 'a', pop: '#', push: ['A', '#'] }]
    })
    expect(parseLabels('eps # #; b A eps', doc)).toEqual({
      labels: [
        { read: 'ε', pop: '#', push: ['#'] },
        { read: 'b', pop: 'A', push: [] }
      ]
    })
  })

  it('Kurzform verlangt ebenfalls ein Top of Stack', () => {
    expect(parseLabels('a eps A', pda())).toEqual({ error: '„a eps A“: Top of Stack fehlt' })
  })

  it('meldet Text ohne Pfeil', () => {
    expect(parseLabels('a, #', pda())).toEqual({
      error: '„a, #“ ist keine Stackregel (a, Z → AZ)'
    })
  })

  it('zerlegt Stackwörter mit Mehrzeichen-Symbolen (längstes zuerst)', () => {
    expect(parseStackWord('X1X1#', ['X1', 'X', '#'])).toEqual(['X1', 'X1', '#'])
    expect(parseStackWord('ε', ['#'])).toEqual([])
  })

  it('liest beim endlichen Automaten weiter nur Symbole', () => {
    expect(parseLabels('a, b eps', createEmptyDocument('NFA'))).toEqual({
      labels: [{ read: 'a' }, { read: 'b' }, { read: 'ε' }]
    })
  })
})

describe('Stackregeln schreiben', () => {
  it('formatiert Regeln und Stackinhalt', () => {
    expect(formatLabel({ read: 'a', pop: '#', push: ['A', '#'] })).toBe('a, # → A#')
    expect(formatLabel({ read: 'ε', pop: 'A', push: [] })).toBe('ε, A → ε')
    expect(formatStack(['#', 'A', 'B'])).toBe('BA#')
    expect(formatStack([])).toBe('ε')
  })

  it('Symbole in einer Zeile, Stackregeln je eine Zeile', () => {
    expect(labelLines([{ read: 'a' }, { read: 'b' }])).toEqual(['a, b'])
    const rules = [
      { read: 'a', pop: '#', push: ['A', '#'] },
      { read: 'a', pop: 'A', push: ['A', 'A'] }
    ]
    expect(labelLines(rules)).toEqual(['a, # → A#', 'a, A → AA'])
    expect(formatLabelsInline(rules)).toBe('a, # → A#; a, A → AA')
  })

  it('trennt Push-Wörter, die mit Γ sonst anders zurückgelesen würden', () => {
    const gamma = ['A', 'B', 'AB', '#']
    for (const push of [['A', 'B'], ['AB'], ['A', 'B', '#'], ['AB', 'A'], ['B', 'A']]) {
      const text = formatStackWord(push, gamma)
      expect(parseStackWord(text, gamma), text).toEqual(push)
    }
    expect(formatStackWord(['A', 'B'], gamma)).toBe('A B')
    // eindeutig: weiter ohne Leerzeichen
    expect(formatStackWord(['B', 'A', '#'], gamma)).toBe('BA#')
    expect(formatStackWord(['A', '#'], ['A', '#'])).toBe('A#')
    expect(formatStack(['B', 'A'], gamma)).toBe('A B')
  })

  it('Regeln mit Γ überstehen Formatieren und erneutes Einlesen', () => {
    const doc = pda(['A', 'B', 'AB', '#'])
    const rules = [
      { read: 'a', pop: '#', push: ['A', 'B', '#'] },
      { read: 'a', pop: 'A', push: ['AB'] },
      { read: 'b', pop: 'B', push: ['A', 'B'] }
    ]
    const gamma = doc.stack!.alphabet
    expect(parseLabels(formatLabelsInline(rules, gamma), doc)).toEqual({ labels: rules })
    for (const rule of rules) {
      expect(parseLabels(formatLabel(rule, gamma), doc)).toEqual({ labels: [rule] })
    }
    expect(labelLines(rules, gamma)).toEqual(['a, # → A B #', 'a, A → AB', 'b, B → A B'])
    // Vorschläge im Push-Feld werden genauso eingelesen
    for (const text of pushSuggestions('B', gamma)) {
      const push = parseStackWord(text, gamma)
      expect(formatStackWord(push, gamma), text).toBe(text)
    }
  })
})

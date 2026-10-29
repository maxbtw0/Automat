import { describe, expect, it } from 'vitest'
import { NFA } from '@/core/automaton/nfa'
import { allWords, buildDocument } from '@/core/automaton/testing'
import { EPSILON, createEmptyDocument, type AutomatonDocument } from '@/model/graph'
import { findDifference, machineFromDocument, regexToMachine, type Machine } from './equivalence'
import { automatonToRegex } from './fromAutomaton'
import { compareRegexWithAutomaton } from './compare'
import { formatRegex, parseRegex } from './regex'

/** Macht aus einer Machine ein NEA-Dokument, um sie unabhängig vom Vergleich zu simulieren. */
function machineToDocument(m: Machine, alphabet: string[]): AutomatonDocument {
  const doc = createEmptyDocument('NFA')
  doc.alphabet = alphabet
  doc.graph = {
    states: m.graph.states.map((s) => ({
      ...s,
      isStart: s.id === m.start,
      isFinal: m.finals.has(s.id)
    })),
    transitions: m.graph.transitions
  }
  return doc
}

/** Regex aus dem Automaten → Thompson-NEA; beide urteilen für alle Wörter bis Länge 6 gleich. */
function expectSameLanguage(doc: AutomatonDocument): string {
  const regex = automatonToRegex(doc)
  const fromRegex = new NFA(machineToDocument(regexToMachine(regex), doc.alphabet))
  const original = new NFA({ ...doc, type: 'NFA' })
  for (const w of allWords(doc.alphabet, 6)) {
    expect(fromRegex.accepts(w), `„${w}“ bei ${formatRegex(regex)}`).toBe(original.accepts(w))
  }
  return formatRegex(regex)
}

describe('automatonToRegex', () => {
  it('„endet auf ab“', () => {
    expectSameLanguage(
      buildDocument('NFA', ['a', 'b'], { start: 'q0', finals: ['q2'] }, [
        ['q0', 'a,b', 'q0'],
        ['q0', 'a', 'q1'],
        ['q1', 'b', 'q2']
      ])
    )
  })

  it('gerade Anzahl a (DEA mit Schleifen in beiden Zuständen)', () => {
    const text = expectSameLanguage(
      buildDocument('DFA', ['a', 'b'], { start: 'q0', finals: ['q0'] }, [
        ['q0', 'a', 'q1'],
        ['q1', 'a', 'q0'],
        ['q0', 'b', 'q0'],
        ['q1', 'b', 'q1']
      ])
    )
    expect(text).toBe('(b+ab*a)*')
  })

  it('mit ε-Übergängen', () => {
    expectSameLanguage(
      buildDocument('NFA', ['a', 'b'], { start: 'q0', finals: ['q2'] }, [
        ['q0', EPSILON, 'q1'],
        ['q1', 'a', 'q2'],
        ['q0', 'b', 'q0'],
        ['q2', EPSILON, 'q0']
      ])
    )
  })

  it('ohne Endzustand ist die Sprache leer', () => {
    const doc = buildDocument('DFA', ['a'], { start: 'q0' }, [['q0', 'a', 'q0']])
    expect(formatRegex(automatonToRegex(doc))).toBe('∅')
  })

  it('Start ist Endzustand ohne Übergänge → ε', () => {
    const doc = buildDocument('DFA', ['a'], { start: 'q0', finals: ['q0'] }, [])
    expect(formatRegex(automatonToRegex(doc))).toBe('ε')
  })

  it('braucht einen Startzustand', () => {
    expect(() => automatonToRegex(buildDocument('DFA', ['a'], { states: ['q0'] }, []))).toThrow()
  })
})

describe('findDifference', () => {
  const endsWithAb = buildDocument('NFA', ['a', 'b'], { start: 'q0', finals: ['q2'] }, [
    ['q0', 'a,b', 'q0'],
    ['q0', 'a', 'q1'],
    ['q1', 'b', 'q2']
  ])
  const automaton = machineFromDocument(endsWithAb)
  const regex = (text: string): Machine => regexToMachine(parseRegex(text))

  it('erkennt gleiche Sprachen trotz anderer Schreibweise', () => {
    expect(findDifference(automaton, regex('(a|b)*ab'), ['a', 'b'])).toBeNull()
    expect(findDifference(automaton, regex('(a*b*)*ab'), ['a', 'b'])).toBeNull()
  })

  it('liefert das kürzeste Gegenbeispiel', () => {
    expect(findDifference(automaton, regex('(a|b)*b'), ['a', 'b'])).toEqual({
      word: ['b'],
      acceptedBy: 'second'
    })
    expect(findDifference(automaton, regex('ab'), ['a', 'b'])).toEqual({
      word: ['a', 'a', 'b'],
      acceptedBy: 'first'
    })
  })

  it('unterscheidet beim leeren Wort', () => {
    expect(findDifference(automaton, regex('((a|b)*ab)|ε'), ['a', 'b'])).toEqual({
      word: [],
      acceptedBy: 'second'
    })
  })
})

describe('compareRegexWithAutomaton', () => {
  const doc = buildDocument('DFA', ['a', 'b'], { start: 'q0', finals: ['q0'] }, [
    ['q0', 'a', 'q1'],
    ['q1', 'a', 'q0'],
    ['q0', 'b', 'q0'],
    ['q1', 'b', 'q1']
  ])

  it('gleich', () => {
    expect(compareRegexWithAutomaton(doc, parseRegex('b*(ab*ab*)*'))).toEqual({ kind: 'equal' })
  })

  it('verschieden – mit Symbol, das nicht im Alphabet ist', () => {
    expect(compareRegexWithAutomaton(doc, parseRegex('(b|ab*a)*|c'))).toEqual({
      kind: 'different',
      word: 'c',
      acceptedBy: 'regex'
    })
  })
})

describe('Schlüssel und Hilfszustände', () => {
  const NUL = String.fromCharCode(0)

  it('automatonToRegex: Zustände mit den IDs des neuen Starts/Endes stören nicht', () => {
    const doc = buildDocument('NFA', ['a', 'b'], { start: `${NUL}start`, finals: [`${NUL}final`] }, [
      [`${NUL}start`, 'a', `${NUL}final`],
      [`${NUL}final`, 'b', `${NUL}final`]
    ])
    const regex = automatonToRegex(doc)
    expect(formatRegex(regex)).toBe('ab*')
  })

  it('findDifference: Mengen {„x,y“} und {„x“, „y“} bleiben verschieden', () => {
    const state = (id: string, isStart = false, isFinal = false) =>
      ({ id, label: id, x: 0, y: 0, isStart, isFinal })
    const first: AutomatonDocument = {
      type: 'NFA',
      alphabet: ['a', 'b'],
      graph: {
        states: [state('s', true), state('x,y'), state('x', false, true), state('y')],
        transitions: [
          { id: 't0', from: 's', to: 'x,y', labels: [{ read: 'a' }] },
          { id: 't1', from: 's', to: 'x', labels: [{ read: 'b' }] },
          { id: 't2', from: 's', to: 'y', labels: [{ read: 'b' }] }
        ]
      }
    }
    const nothing = buildDocument('NFA', ['a', 'b'], { start: 'q0' }, [['q0', 'a,b', 'q0']])
    expect(
      findDifference(machineFromDocument(first), machineFromDocument(nothing), ['a', 'b'])
    ).toEqual({ word: ['b'], acceptedBy: 'first' })
  })
})

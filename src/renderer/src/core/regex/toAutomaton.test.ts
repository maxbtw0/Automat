import { describe, expect, it } from 'vitest'
import { DFA } from '@/core/automaton/dfa'
import { NFA } from '@/core/automaton/nfa'
import { EPSILON, readsSymbol } from '@/model/graph'
import { findDifference, machineFromDocument, regexToMachine } from './equivalence'
import { parseRegex } from './regex'
import { regexToDocument } from './toAutomaton'

const languagesEqual = (text: string, kind: 'dfa' | 'nfa'): void => {
  const regex = parseRegex(text)
  const doc = regexToDocument(regex, kind)
  expect(findDifference(machineFromDocument(doc), regexToMachine(regex), doc.alphabet)).toBeNull()
}

describe('regexToDocument', () => {
  it('baut den minimalen DEA für (a+b)*ab', () => {
    const doc = regexToDocument(parseRegex('(a+b)*ab'), 'dfa')
    expect(doc.type).toBe('DFA')
    expect(doc.alphabet).toEqual(['a', 'b'])
    expect(doc.graph.states.map((s) => s.label)).toEqual(['q0', 'q1', 'q2'])
    expect(new DFA(doc).validate().filter((i) => i.severity === 'error')).toEqual([])
    languagesEqual('(a+b)*ab', 'dfa')
  })

  it('baut einen ε-NEA nach Thompson', () => {
    const doc = regexToDocument(parseRegex('a*b'), 'nfa')
    expect(doc.type).toBe('NFA')
    expect(doc.graph.transitions.some((t) => readsSymbol(t, EPSILON))).toBe(true)
    expect(new NFA(doc).accepts('aab')).toBe(true)
    expect(new NFA(doc).accepts('aba')).toBe(false)
    languagesEqual('a*b', 'nfa')
  })

  it('ein Übergang pro Zustandspaar', () => {
    const doc = regexToDocument(parseRegex('(a+ε)*'), 'nfa')
    const pairs = doc.graph.transitions.map((t) => `${t.from}|${t.to}`)
    expect(new Set(pairs).size).toBe(pairs.length)
  })

  it('übernimmt das bisherige Alphabet', () => {
    const doc = regexToDocument(parseRegex('a'), 'dfa', ['c', 'b'])
    expect(doc.alphabet).toEqual(['a', 'b', 'c'])
  })

  it('wirft, wenn Ausdruck und bisheriges Alphabet zusammen mehrdeutig wären', () => {
    for (const kind of ['dfa', 'nfa'] as const) {
      expect(() => regexToDocument(parseRegex('a', ['ab']), kind, ['ab'])).toThrow(
        '„a“ einzeln und in „ab“'
      )
    }
  })

  it('∅ wird der minimale vollständige DEA: ein Zustand mit Schleife', () => {
    const doc = regexToDocument(parseRegex('∅'), 'dfa', ['a', 'b'])
    expect(doc.graph.states).toEqual([
      expect.objectContaining({ label: 'q0', isStart: true, isFinal: false })
    ])
    expect(doc.graph.transitions).toEqual([
      expect.objectContaining({ from: doc.graph.states[0].id, to: doc.graph.states[0].id })
    ])
    expect(new DFA(doc).validate().filter((i) => i.severity !== 'info')).toEqual([])
  })

  it('verschiedene Ausdrücke bleiben sprachgleich', () => {
    for (const text of ['ε', '∅', 'a+b', '(ab)*a', '(a+bc)*(b+ε)']) {
      languagesEqual(text, 'dfa')
      languagesEqual(text, 'nfa')
    }
  })
})

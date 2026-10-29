import { describe, expect, it } from 'vitest'
import { NFA, isDeterministic } from '@/core/automaton/nfa'
import { allWords, buildDocument } from '@/core/automaton/testing'
import { EPSILON, type AutomatonDocument } from '@/model/graph'
import { nfaToDfa } from './subsetConstruction'

/** Prüft: der DEA ist deterministisch und akzeptiert genau dieselben Wörter (bis Länge 6). */
function expectEquivalentDfa(nfaDoc: AutomatonDocument): AutomatonDocument {
  const dfaDoc = nfaToDfa(nfaDoc)
  expect(dfaDoc.type).toBe('DFA')
  expect(isDeterministic(dfaDoc)).toBe(true)
  // Ein DEA ist auch ein NEA – so lässt er sich ohne die DEA-Klasse simulieren.
  const nfa = new NFA(nfaDoc)
  const dfa = new NFA({ ...dfaDoc, type: 'NFA' })
  for (const w of allWords(nfaDoc.alphabet, 6)) expect(dfa.accepts(w), `„${w}“`).toBe(nfa.accepts(w))
  return dfaDoc
}

describe('nfaToDfa', () => {
  it('wandelt „endet auf ab“ in den bekannten DEA mit 3 Zuständen um', () => {
    const dfa = expectEquivalentDfa(
      buildDocument('NFA', ['a', 'b'], { start: 'q0', finals: ['q2'] }, [
        ['q0', 'a,b', 'q0'],
        ['q0', 'a', 'q1'],
        ['q1', 'b', 'q2']
      ])
    )
    expect(dfa.graph.states.map((s) => s.label).sort()).toEqual(['{q0,q1}', '{q0,q2}', '{q0}'])
    expect(dfa.graph.states.find((s) => s.isStart)?.label).toBe('{q0}')
    expect(dfa.graph.states.filter((s) => s.isFinal).map((s) => s.label)).toEqual(['{q0,q2}'])
  })

  it('berücksichtigt ε-Hüllen (auch für den Start)', () => {
    const dfa = expectEquivalentDfa(
      buildDocument('NFA', ['a', 'b'], { start: 'q0', finals: ['q2'] }, [
        ['q0', EPSILON, 'q1'],
        ['q1', 'a', 'q2'],
        ['q0', 'b', 'q0'],
        ['q2', EPSILON, 'q0']
      ])
    )
    expect(dfa.graph.states.find((s) => s.isStart)?.label).toBe('{q0,q1}')
  })

  it('lässt die leere Menge weg', () => {
    const dfa = nfaToDfa(
      buildDocument('NFA', ['a', 'b'], { start: 'q0', finals: ['q1'] }, [['q0', 'a', 'q1']])
    )
    expect(dfa.graph.states.map((s) => s.label)).toEqual(['{q0}', '{q1}'])
  })

  it('braucht einen Startzustand', () => {
    expect(() => nfaToDfa(buildDocument('NFA', ['a'], { states: ['q0'] }, []))).toThrow()
  })
})

describe('nfaToDfa: Schlüssel der Teilmengen', () => {
  it('verwechselt {„x|y“} nicht mit {„x“, „y“}', () => {
    const state = (id: string, isStart = false, isFinal = false) =>
      ({ id, label: id, x: 0, y: 0, isStart, isFinal })
    const doc: AutomatonDocument = {
      type: 'NFA',
      alphabet: ['a', 'b'],
      graph: {
        states: [state('s', true), state('x|y', false, true), state('x'), state('y')],
        transitions: [
          { id: 't0', from: 's', to: 'x|y', labels: [{ read: 'a' }] },
          { id: 't1', from: 's', to: 'x', labels: [{ read: 'b' }] },
          { id: 't2', from: 's', to: 'y', labels: [{ read: 'b' }] }
        ]
      }
    }
    const dfa = expectEquivalentDfa(doc)
    expect(dfa.graph.states.map((s) => s.label).sort()).toEqual(['{s}', '{x,y}', '{x|y}'])
  })
})

import { describe, expect, it } from 'vitest'
import { buildDocument } from '@/core/automaton/testing'
import { findDifference, machineFromDocument } from '@/core/regex/equivalence'
import { EPSILON, type AutomatonDocument } from '@/model/graph'
import { minimizeDfa } from './minimize'
import { nfaToDfa } from './subsetConstruction'

/** Minimiert und prüft, dass die Sprache gleich bleibt. */
function minimized(doc: AutomatonDocument): AutomatonDocument {
  const result = minimizeDfa(doc)
  const difference = findDifference(machineFromDocument(doc), machineFromDocument(result), doc.alphabet)
  expect(difference).toBeNull()
  return result
}

const labels = (doc: AutomatonDocument): string[] => doc.graph.states.map((s) => s.label).sort()

describe('minimizeDfa', () => {
  it('fasst äquivalente Zustände zusammen („endet auf b“: 4 → 2)', () => {
    const doc = buildDocument('DFA', ['a', 'b'], { start: 'q0', finals: ['q2', 'q3'] }, [
      ['q0', 'a', 'q1'],
      ['q0', 'b', 'q2'],
      ['q1', 'a', 'q0'],
      ['q1', 'b', 'q3'],
      ['q2', 'a', 'q1'],
      ['q2', 'b', 'q3'],
      ['q3', 'a', 'q0'],
      ['q3', 'b', 'q2']
    ])
    const result = minimized(doc)
    expect(labels(result)).toEqual(['q0/q1', 'q2/q3'])
    expect(result.graph.states.find((s) => s.isStart)?.label).toBe('q0/q1')
  })

  it('lässt einen schon minimalen partiellen DEA unverändert (kein sichtbarer Fangzustand)', () => {
    const doc = buildDocument('DFA', ['a', 'b'], { start: 'q0', finals: ['q2'] }, [
      ['q0', 'a', 'q1'],
      ['q1', 'b', 'q2']
    ])
    expect(labels(minimized(doc))).toEqual(['q0', 'q1', 'q2'])
  })

  it('entfernt tote und unerreichbare Zustände', () => {
    const doc = buildDocument('DFA', ['a', 'b'], { start: 'q0', finals: ['q1'], states: ['q9'] }, [
      ['q0', 'a', 'q1'],
      ['q0', 'b', 'tot'],
      ['tot', 'a,b', 'tot'],
      ['q1', 'a,b', 'q1']
    ])
    expect(labels(minimized(doc))).toEqual(['q0', 'q1'])
  })

  it('leere Sprache: nur der Startzustand bleibt', () => {
    const doc = buildDocument('DFA', ['a'], { start: 'q0' }, [['q0', 'a', 'q1']])
    const result = minimized(doc)
    expect(result.graph.states).toEqual([expect.objectContaining({ label: 'q0', isStart: true })])
    expect(result.graph.transitions).toEqual([])
  })

  it('lehnt nichtdeterministische Automaten und ε ab', () => {
    const nd = buildDocument('DFA', ['a'], { start: 'q0' }, [
      ['q0', 'a', 'q0'],
      ['q0', 'a', 'q1']
    ])
    expect(() => minimizeDfa(nd)).toThrow('nicht deterministisch')
    const eps = buildDocument('DFA', ['a'], { start: 'q0' }, [['q0', EPSILON, 'q1']])
    expect(() => minimizeDfa(eps)).toThrow('ε')
  })

  it('NEA → Potenzmengenkonstruktion → Minimierung', () => {
    const nfa = buildDocument('NFA', ['a', 'b'], { start: 'q0', finals: ['q2'] }, [
      ['q0', 'a,b', 'q0'],
      ['q0', 'a', 'q1'],
      ['q1', 'b', 'q2']
    ])
    const dfa = minimized(nfaToDfa(nfa))
    expect(dfa.graph.states).toHaveLength(3)
  })
})

describe('minimizeDfa: Hilfszustand', () => {
  it('ein importierter Zustand mit der ID des unsichtbaren Fangzustands bleibt erhalten', () => {
    const trapId = `${String.fromCharCode(0)}trap`
    const doc = buildDocument('DFA', ['a', 'b'], { start: 'q0', finals: [trapId] }, [
      ['q0', 'a', trapId]
    ])
    const result = minimized(doc)
    expect(result.graph.states).toHaveLength(2)
    expect(result.graph.states.filter((s) => s.isFinal)).toHaveLength(1)
  })
})

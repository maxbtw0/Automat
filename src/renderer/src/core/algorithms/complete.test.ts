import { describe, expect, it } from 'vitest'
import { DFA } from '@/core/automaton/dfa'
import { buildDocument } from '@/core/automaton/testing'
import { findDifference, machineFromDocument } from '@/core/regex/equivalence'
import { edgeSymbols } from '@/model/graph'
import { completeDfa } from './complete'

/** Nur „ab“: partieller DEA */
const onlyAb = buildDocument('DFA', ['a', 'b'], { start: 'q0', finals: ['q2'] }, [
  ['q0', 'a', 'q1'],
  ['q1', 'b', 'q2']
])

const symbolsTo = (doc: ReturnType<typeof completeDfa>, from: string, to: string): string[] => {
  const label = (id: string) => doc.graph.states.find((s) => s.id === id)?.label
  return doc.graph.transitions
    .filter((t) => label(t.from) === from && label(t.to) === to)
    .flatMap(edgeSymbols)
}

describe('completeDfa', () => {
  it('ergänzt den Fangzustand „trap“ für alle fehlenden Übergänge', () => {
    const doc = completeDfa(onlyAb)
    expect(doc.graph.states.map((s) => s.label).sort()).toEqual(['q0', 'q1', 'q2', 'trap'])
    expect(symbolsTo(doc, 'q0', 'trap')).toEqual(['b'])
    expect(symbolsTo(doc, 'q1', 'trap')).toEqual(['a'])
    expect(symbolsTo(doc, 'q2', 'trap')).toEqual(['a', 'b'])
    expect(symbolsTo(doc, 'trap', 'trap')).toEqual(['a', 'b'])
    expect(doc.graph.states.find((s) => s.label === 'trap')).toMatchObject({
      isStart: false,
      isFinal: false
    })
  })

  it('danach meldet die Prüfung keine Unvollständigkeit, die Sprache bleibt gleich', () => {
    const doc = completeDfa(onlyAb)
    expect(new DFA(doc).validate().filter((i) => i.severity !== 'info')).toEqual([])
    const difference = findDifference(machineFromDocument(onlyAb), machineFromDocument(doc), [
      'a',
      'b'
    ])
    expect(difference).toBeNull()
  })

  it('ändert einen vollständigen DEA nicht', () => {
    const complete = completeDfa(onlyAb)
    expect(completeDfa(complete)).toBe(complete)
  })

  it('weicht aus, wenn es schon einen Zustand „trap“ gibt', () => {
    // Endzustand – kann also nicht selbst der Fangzustand sein
    const doc = buildDocument('DFA', ['a'], { start: 'trap', finals: ['trap'] }, [])
    expect(completeDfa(doc).graph.states.map((s) => s.label)).toEqual(['trap', 'trap1'])
  })

  it('nimmt einen vorhandenen toten Zustand als Fangzustand statt eines zweiten', () => {
    const doc = buildDocument('DFA', ['a', 'b'], { start: 'q0', finals: ['q1'] }, [
      ['q0', 'a', 'q1'],
      ['q0', 'b', 'tot'],
      ['tot', 'a', 'tot']
    ])
    const result = completeDfa(doc)
    expect(result.graph.states.map((s) => s.label)).toEqual(['q0', 'q1', 'tot'])
    expect(symbolsTo(result, 'tot', 'tot')).toEqual(['a', 'b'])
    expect(symbolsTo(result, 'q1', 'tot')).toEqual(['a', 'b'])
    // ein Übergang pro Zustandspaar
    const pairs = result.graph.transitions.map((t) => `${t.from}→${t.to}`)
    expect(new Set(pairs).size).toBe(pairs.length)
    expect(new DFA(result).validate().filter((i) => i.severity !== 'info')).toEqual([])
  })

  it('leere Sprache nach der Minimierung: der Start wird selbst zum Fangzustand', () => {
    const empty = buildDocument('DFA', ['a'], { start: 'q0' }, [])
    const result = completeDfa(empty)
    expect(result.graph.states).toHaveLength(1)
    expect(symbolsTo(result, 'q0', 'q0')).toEqual(['a'])
  })
})

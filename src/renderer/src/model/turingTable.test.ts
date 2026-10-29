import { describe, expect, it } from 'vitest'
import { buildDocument } from '@/core/automaton/testing'
import { setTuringCell, turingCell } from './turingTable'

const tm = () =>
  buildDocument('TM', ['a', 'b'], { start: 'q0', states: ['q2'] }, [
    ['q0', 'a → a, R; b → b, R', 'q0'],
    ['q0', '# → #, L', 'q1']
  ])

const labelsOf = (graph: ReturnType<typeof tm>['graph'], from: string, to: string) =>
  graph.transitions.find((t) => t.from === from && t.to === to)?.labels

describe('Turing-Tabelle', () => {
  it('liest eine Zelle aus dem Graphen – leer = null', () => {
    const { graph } = tm()
    expect(turingCell(graph, 'q0', '#')).toEqual({ to: 'q1', write: '#', move: 'L' })
    expect(turingCell(graph, 'q1', 'a')).toBeNull()
  })

  it('ändert eine Zelle an Ort und Stelle, wenn der Folgezustand bleibt', () => {
    const { graph } = tm()
    const next = setTuringCell(graph, 'q0', 'a', { to: 'q0', write: 'X', move: 'L' })
    expect(labelsOf(next, 'q0', 'q0')).toEqual([
      { read: 'a', write: 'X', move: 'L' },
      { read: 'b', write: 'b', move: 'R' }
    ])
  })

  it('verschiebt die Regel auf einen neuen Übergang und löscht leere Übergänge', () => {
    const { graph } = tm()
    const next = setTuringCell(graph, 'q0', '#', { to: 'q2', write: 'Y', move: 'N' })
    expect(labelsOf(next, 'q0', 'q1')).toBeUndefined()
    expect(labelsOf(next, 'q0', 'q2')).toEqual([{ read: '#', write: 'Y', move: 'N' }])
    expect(next.transitions).toHaveLength(2)
  })

  it('leert eine Zelle, der Übergang bleibt mit den übrigen Regeln', () => {
    const { graph } = tm()
    const next = setTuringCell(graph, 'q0', 'a', null)
    expect(labelsOf(next, 'q0', 'q0')).toEqual([{ read: 'b', write: 'b', move: 'R' }])
    expect(turingCell(next, 'q0', 'a')).toBeNull()
  })

  it('fügt an einen bestehenden Übergang an', () => {
    const { graph } = tm()
    const next = setTuringCell(graph, 'q0', 'X', { to: 'q1', write: 'X', move: 'R' })
    expect(labelsOf(next, 'q0', 'q1')).toEqual([
      { read: '#', write: '#', move: 'L' },
      { read: 'X', write: 'X', move: 'R' }
    ])
  })
})

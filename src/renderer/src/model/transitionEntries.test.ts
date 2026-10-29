import { describe, expect, it } from 'vitest'
import {
  addTransitionEntry,
  listTransitionEntries,
  removeTransitionEntry,
  replaceTransitionEntry,
  sortTransitionEntries,
  symbolLabels,
  type EditorGraph,
  type StateNode,
  type TransitionEdge
} from './graph'

const L = (...symbols: string[]) => symbolLabels(symbols)
const reads = (t: TransitionEdge): string[] => t.labels.map((l) => l.read)

const state = (id: string, label = id): StateNode => ({
  id,
  label,
  x: 0,
  y: 0,
  isStart: false,
  isFinal: false
})

/** q0 →{a, b}→ q1, q1 →{a}→ q1 */
function graph(): EditorGraph {
  return {
    states: [state('q0'), state('q1')],
    transitions: [
      { id: 't1', from: 'q0', to: 'q1', labels: L('a', 'b') },
      { id: 't2', from: 'q1', to: 'q1', labels: L('a') }
    ]
  }
}

describe('listTransitionEntries', () => {
  it('liefert eine Zeile pro Symbol', () => {
    expect(listTransitionEntries(graph())).toEqual([
      { from: 'q0', symbol: 'a', to: 'q1' },
      { from: 'q0', symbol: 'b', to: 'q1' },
      { from: 'q1', symbol: 'a', to: 'q1' }
    ])
  })

  it('zeigt einen Übergang ohne Symbol als Zeile mit symbol null', () => {
    const g: EditorGraph = { ...graph(), transitions: [{ id: 't', from: 'q0', to: 'q0', labels: L() }] }
    expect(listTransitionEntries(g)).toEqual([{ from: 'q0', symbol: null, to: 'q0' }])
  })
})

describe('addTransitionEntry', () => {
  it('ergänzt das Symbol auf dem bestehenden Übergang', () => {
    const g = addTransitionEntry(graph(), { from: 'q1', symbol: 'b', to: 'q1' })
    expect(g.transitions).toHaveLength(2)
    expect(g.transitions[1]).toMatchObject({ id: 't2', labels: L('a', 'b') })
  })

  it('legt einen neuen Übergang an, wenn es das Zustandspaar noch nicht gibt', () => {
    const g = addTransitionEntry(graph(), { from: 'q1', symbol: 'b', to: 'q0' })
    expect(g.transitions).toHaveLength(3)
    expect(g.transitions[2]).toMatchObject({ from: 'q1', to: 'q0', labels: L('b') })
  })

  it('ändert nichts, wenn die Zeile schon existiert', () => {
    const g = graph()
    expect(addTransitionEntry(g, { from: 'q0', symbol: 'a', to: 'q1' })).toBe(g)
  })
})

describe('removeTransitionEntry', () => {
  it('entfernt nur das Symbol', () => {
    const g = removeTransitionEntry(graph(), { from: 'q0', symbol: 'a', to: 'q1' })
    expect(reads(g.transitions[0])).toEqual(['b'])
  })

  it('entfernt den Übergang, wenn das letzte Symbol weg ist', () => {
    const g = removeTransitionEntry(graph(), { from: 'q1', symbol: 'a', to: 'q1' })
    expect(g.transitions.map((t) => t.id)).toEqual(['t1'])
  })
})

describe('replaceTransitionEntry', () => {
  it('ändert das Symbol an derselben Position', () => {
    const g = replaceTransitionEntry(
      graph(),
      { from: 'q0', symbol: 'a', to: 'q1' },
      { from: 'q0', symbol: 'c', to: 'q1' }
    )
    expect(reads(g.transitions[0])).toEqual(['c', 'b'])
  })

  it('verschiebt die Zeile auf einen anderen Folgezustand', () => {
    const g = replaceTransitionEntry(
      graph(),
      { from: 'q1', symbol: 'a', to: 'q1' },
      { from: 'q1', symbol: 'a', to: 'q0' }
    )
    expect(listTransitionEntries(g)).toContainEqual({ from: 'q1', symbol: 'a', to: 'q0' })
    expect(g.transitions.find((t) => t.id === 't2')).toBeUndefined()
  })

  it('verschmilzt mit einer bestehenden Zeile', () => {
    const g = replaceTransitionEntry(
      graph(),
      { from: 'q0', symbol: 'a', to: 'q1' },
      { from: 'q0', symbol: 'b', to: 'q1' }
    )
    expect(reads(g.transitions[0])).toEqual(['b'])
  })
})

describe('sortTransitionEntries', () => {
  it('sortiert nach Zustand, dann Symbol, dann Folgezustand', () => {
    const g: EditorGraph = {
      states: [state('s10', 'q10'), state('s2', 'q2'), state('s1', 'q1')],
      transitions: [
        { id: 't1', from: 's10', to: 's1', labels: L('a') },
        { id: 't2', from: 's2', to: 's2', labels: L('b') },
        { id: 't3', from: 's2', to: 's1', labels: L('b', 'a') }
      ]
    }
    const sorted = sortTransitionEntries(g, listTransitionEntries(g)).map(
      (e) => `${e.from} ${e.symbol} ${e.to}`
    )
    expect(sorted).toEqual(['s2 a s1', 's2 b s1', 's2 b s2', 's10 a s1'])
  })
})

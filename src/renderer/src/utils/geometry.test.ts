import { describe, expect, it } from 'vitest'
import { buildDocument } from '@/core/automaton/testing'
import { loopAngle, selfLoop } from './geometry'

const graphWith = (positions: Record<string, [number, number]>, edges: [string, string][]) => {
  const doc = buildDocument(
    'DFA',
    ['a'],
    { states: Object.keys(positions) },
    edges.map(([from, to]) => [from, 'a', to])
  )
  doc.graph.states = doc.graph.states.map((s) => ({ ...s, x: positions[s.id][0], y: positions[s.id][1] }))
  return doc.graph
}

const deg = (rad: number): number => Math.round((rad * 180) / Math.PI)

describe('loopAngle', () => {
  it('oben, wenn dort Platz ist', () => {
    const g = graphWith({ p: [0, 0], q: [200, 0] }, [['p', 'q'], ['p', 'p']])
    expect(deg(loopAngle(g.states[0], g))).toBe(0)
  })

  it('unten, wenn Übergänge von oben kommen (z. B. Fangzustand)', () => {
    const g = graphWith(
      { trap: [0, 200], a: [-150, 0], b: [0, 0], c: [150, 0] },
      [['a', 'trap'], ['b', 'trap'], ['c', 'trap'], ['trap', 'trap']]
    )
    const trap = g.states.find((s) => s.id === 'trap')!
    expect(deg(loopAngle(trap, g))).toBe(180)
  })
})

describe('selfLoop', () => {
  it('nach unten gedreht liegt die Beschriftung unter dem Zustand', () => {
    const up = selfLoop({ x: 0, y: 0 })
    const down = selfLoop({ x: 0, y: 0 }, undefined, Math.PI)
    expect(up.label.y).toBeLessThan(0)
    expect(down.label.y).toBeCloseTo(-up.label.y)
    expect(down.label.x).toBeCloseTo(0)
  })
})

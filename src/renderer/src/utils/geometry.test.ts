import { describe, expect, it } from 'vitest'
import { buildDocument } from '@/core/automaton/testing'
import { boxCorners, elementsInPolygon, loopAngle, selfLoop } from './geometry'

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

describe('elementsInPolygon', () => {
  it('nimmt Zustände mit Mittelpunkt im Rechteck und die Übergänge zwischen ihnen', () => {
    const g = graphWith(
      { p: [0, 0], q: [100, 0], r: [300, 0] },
      [['p', 'q'], ['q', 'r'], ['q', 'q']]
    )
    const found = elementsInPolygon(g, boxCorners({ x: 150, y: 50 }, { x: -50, y: -50 }))
    expect(found.stateIds).toEqual(['p', 'q'])
    const kept = g.transitions.filter((t) => found.transitionIds.includes(t.id))
    expect(kept.map((t) => `${t.from}${t.to}`)).toEqual(['pq', 'qq'])
  })

  it('Lasso in U-Form: der Zustand in der Bucht bleibt draußen', () => {
    const g = graphWith({ p: [0, 0], q: [100, 0], r: [200, 0] }, [['p', 'r']])
    // Bucht von oben bis unter q, links um p und rechts um r herum
    const u = [
      { x: -50, y: -50 },
      { x: 50, y: -50 },
      { x: 50, y: 30 },
      { x: 150, y: 30 },
      { x: 150, y: -50 },
      { x: 250, y: -50 },
      { x: 250, y: 50 },
      { x: -50, y: 50 }
    ]
    const found = elementsInPolygon(g, u)
    expect(found.stateIds).toEqual(['p', 'r'])
    expect(found.transitionIds).toHaveLength(1)
  })
})

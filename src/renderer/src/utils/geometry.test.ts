import { describe, expect, it } from 'vitest'
import { buildDocument } from '@/core/automaton/testing'
import {
  BEND_STRAIGHT_THRESHOLD,
  LOOP_MAX_SIZE,
  bendFromPoint,
  loopFromPoint,
  snapDelta,
  snapPoint,
  boxCorners,
  edgeGeometries,
  elementsInPolygon,
  loopAngle,
  selfLoop,
  transitionGeometry
} from './geometry'

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

describe('edgeGeometries', () => {
  it('liefert dasselbe wie die Einzelberechnung – gebogen bei Gegenkante', () => {
    const g = graphWith(
      { p: [0, 0], q: [200, 0], r: [100, 150] },
      [['p', 'q'], ['q', 'p'], ['q', 'r'], ['r', 'r']]
    )
    const all = edgeGeometries(g)
    for (const t of g.transitions) expect(all.get(t.id)).toEqual(transitionGeometry(t, g))
    expect(edgeGeometries(g)).toBe(all)
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

describe('Biegung', () => {
  const g = graphWith({ p: [0, 0], q: [200, 0] }, [['p', 'q']])

  it('bend am Übergang erzeugt einen Bogen mit Beschriftung daran', () => {
    const edge = { ...g.transitions[0], bend: 60 }
    const geometry = transitionGeometry(edge, g)!
    expect(geometry.path).toContain('Q')
    // Scheitel etwa halber Kontrollpunktversatz, nach oben (y negativ)
    expect(geometry.mid.x).toBeCloseTo(100)
    expect(geometry.mid.y).toBeLessThan(-30)
    expect(geometry.mid.y).toBeGreaterThan(-45)
    expect(geometry.label.y).toBeLessThan(geometry.mid.y)
  })

  it('ohne bend bleibt die Linie gerade', () => {
    const geometry = transitionGeometry(g.transitions[0], g)!
    expect(geometry.path).toContain('L')
    expect(geometry.mid).toEqual({ x: 100, y: 0 })
  })

  it('bendFromPoint legt den Scheitel unter den Zeiger', () => {
    const bend = bendFromPoint({ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 100, y: -40 })
    expect(bend).toBeGreaterThan(60)
    const geometry = transitionGeometry({ ...g.transitions[0], bend }, g)!
    expect(geometry.mid.y).toBeCloseTo(-40, 0)
    expect(bendFromPoint({ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 100, y: 3 })).toBeLessThan(
      BEND_STRAIGHT_THRESHOLD
    )
  })

  it('bend überschreibt die automatische Krümmung der Gegenkante', () => {
    const both = graphWith({ p: [0, 0], q: [200, 0] }, [
      ['p', 'q'],
      ['q', 'p']
    ])
    const [pq] = both.transitions
    const automatic = transitionGeometry(pq, both)!
    const custom = transitionGeometry({ ...pq, bend: -90 }, both)!
    expect(custom.mid.y).toBeGreaterThan(0)
    expect(automatic.mid.y).toBeLessThan(0)
  })
})

describe('Schleife drehen und weiten', () => {
  const g = graphWith({ p: [0, 0] }, [['p', 'p']])

  it('loopAngle und loopSize überschreiben die automatische Stelle', () => {
    const geometry = transitionGeometry({ ...g.transitions[0], loopAngle: Math.PI / 2 }, g)!
    // 90 Grad = rechts
    expect(geometry.mid.x).toBeGreaterThan(40)
    expect(geometry.mid.y).toBeCloseTo(0)
    const wide = transitionGeometry(
      { ...g.transitions[0], loopAngle: Math.PI / 2, loopSize: 2 },
      g
    )!
    expect(wide.mid.x).toBeGreaterThan(geometry.mid.x)
  })

  it('loopFromPoint liefert Richtung und Weite; Standardweite rastet auf 1', () => {
    const right = loopFromPoint({ x: 0, y: 0 }, { x: 100, y: 0 })
    expect(deg(right.angle)).toBe(90)
    expect(right.size).toBeGreaterThan(1)
    const standard = transitionGeometry(g.transitions[0], g)!
    const again = loopFromPoint({ x: 0, y: 0 }, standard.mid)
    expect(again.size).toBe(1)
    expect(deg(again.angle)).toBe(0)
    expect(loopFromPoint({ x: 0, y: 0 }, { x: 0, y: -5000 }).size).toBe(LOOP_MAX_SIZE)
  })
})

describe('Einrasten', () => {
  it('snapPoint rundet auf das Raster', () => {
    expect(snapPoint({ x: 29, y: 31 }, 60)).toEqual({ x: 0, y: 60 })
    expect(snapPoint({ x: -31, y: 91 }, 60)).toEqual({ x: -60, y: 120 })
  })

  it('snapDelta rastet den angefassten Zustand ein und gibt dasselbe Delta für alle', () => {
    const delta = snapDelta({ x: 60, y: 60 }, { x: 25, y: -10 }, 60)
    expect(delta).toEqual({ x: 0, y: 0 })
    expect(snapDelta({ x: 60, y: 60 }, { x: 35, y: 40 }, 60)).toEqual({ x: 60, y: 60 })
  })
})

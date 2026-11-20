import { describe, expect, it } from 'vitest'
import { EPSILON } from '@/model/graph'
import { NFA } from './nfa'
import { NfaSimulator } from './nfaSimulator'
import { StateSetSimulator } from './setSimulator'
import { allWords, buildDocument } from './testing'

const sets = (doc: ReturnType<typeof buildDocument>, word: string): boolean =>
  new StateSetSimulator(doc, word, { epsilon: true }).run().accepted

function sameAsStateSets(name: string, doc: ReturnType<typeof buildDocument>, n = 6): void {
  it(`${name}: Akzeptanz wie die Zustandsmengen`, () => {
    for (const w of allWords(doc.alphabet, n)) {
      expect(new NfaSimulator(doc, w).run().accepted, w).toBe(sets(doc, w))
    }
  })
}

const secondLastA = buildDocument('NFA', ['a', 'b'], { start: 'q0', finals: ['q2'] }, [
  ['q0', 'a,b', 'q0'],
  ['q0', 'a', 'q1'],
  ['q1', 'a,b', 'q2']
])
const epsilonCycle = buildDocument('NFA', ['a', 'b'], { start: 'q0', finals: ['q3'] }, [
  ['q0', EPSILON, 'q1'],
  ['q1', EPSILON, 'q2'],
  ['q2', EPSILON, 'q0'],
  ['q2', 'a', 'q2'],
  ['q1', 'b', 'q3'],
  ['q3', EPSILON, 'q3'],
  ['q3', 'a', 'q0']
])
const epsilonToFinal = buildDocument('NFA', ['a', 'b'], { start: 'q0', finals: ['q2'] }, [
  ['q0', 'a', 'q0'],
  ['q0', EPSILON, 'q1'],
  ['q1', EPSILON, 'q2'],
  ['q2', 'b', 'q1']
])
/** Die Schleife in q0 ist eine Sackgasse, wenn „b“ folgt: Backtracking nötig */
const deadEnd = buildDocument('NFA', ['a', 'b'], { start: 'q0', finals: ['q2'] }, [
  ['q0', 'a', 'q0'],
  ['q0', 'a', 'q1'],
  ['q1', 'b', 'q2'],
  ['q2', 'a,b', 'q2']
])

describe('NfaSimulator gegen Zustandsmengen', () => {
  sameAsStateSets('vorletztes Symbol ist a', secondLastA)
  sameAsStateSets('ε-Zyklus', epsilonCycle)
  sameAsStateSets('ε zum Endzustand', epsilonToFinal)
  sameAsStateSets('Sackgasse', deadEnd)
  sameAsStateSets('Schleifen', buildDocument('NFA', ['a', 'b'], { start: 'q0', finals: ['q1'] }, [
    ['q1', 'a,b', 'q1'],
    ['q0', 'a,b', 'q0'],
    ['q0', 'b', 'q1']
  ]))

  it('das leere Wort wird über ε zum Endzustand akzeptiert', () => {
    const { steps, accepted } = new NfaSimulator(epsilonToFinal, '').run()
    expect(accepted).toBe(true)
    expect(steps.map((s) => s.activeStateIds[0])).toEqual(['q1', 'q2'])
  })
})

describe('NfaSimulator: Lauf', () => {
  it('probiert Schleifen zuerst', () => {
    // t0 = q0→q1 steht im Graph vor der Schleife t1 = q0→q0, trotzdem kommt die Schleife zuerst
    const doc = buildDocument('NFA', ['a'], { start: 'q0', finals: ['q1'] }, [
      ['q0', 'a', 'q1'],
      ['q0', 'a', 'q0'],
      ['q1', 'a', 'q1']
    ])
    const { steps } = new NfaSimulator(doc, 'aa').run()
    expect(steps.map((s) => s.activeStateIds[0])).toEqual(['q0', 'q1'])
    expect(steps.map((s) => s.usedTransitionIds[0])).toEqual(['t1', 't0'])
  })

  it('geht bei einer Sackgasse zurück', () => {
    const { steps, accepted } = new NfaSimulator(deadEnd, 'ab').run()
    expect(accepted).toBe(true)
    expect(steps.map((s) => s.activeStateIds[0])).toEqual(['q1', 'q2'])
  })

  it('jeder Schritt hat genau einen aktiven Zustand und einen Übergang', () => {
    for (const w of allWords(['a', 'b'], 5)) {
      const sim = new NfaSimulator(epsilonCycle, w)
      const steps = [sim.reset(), ...sim.run().steps]
      expect(steps[0].usedTransitionIds).toEqual([])
      for (const step of steps) expect(step.activeStateIds).toHaveLength(1)
      for (const step of steps.slice(1)) expect(step.usedTransitionIds).toHaveLength(1)
    }
  })

  it('ε-Schritte lesen nichts', () => {
    const steps = new NfaSimulator(epsilonToFinal, 'ab').run().steps
    // q0 –a→ q0 –ε→ q1 –ε→ q2 –b→ q1: ε-Schritte lassen die Position stehen
    const eps = steps.filter((s) => s.symbol === EPSILON)
    expect(eps.length).toBeGreaterThan(0)
    steps.forEach((s, i) => {
      const before = i === 0 ? 0 : steps[i - 1].inputPosition
      expect(s.inputPosition).toBe(s.symbol === EPSILON ? before : before + 1)
    })
  })

  it('verworfen: zeigt den am weitesten lesenden Lauf', () => {
    // „abb“ in secondLastA: der Lauf liest alles, endet aber nicht im Endzustand
    const sim = new NfaSimulator(secondLastA, 'abb')
    const { steps, accepted } = sim.run()
    expect(accepted).toBe(false)
    expect(steps.at(-1)?.inputPosition).toBe(3)
    // „bbb“ in deadEnd: kein Übergang liest „b“ im Start, der Lauf bleibt leer
    const dead = new NfaSimulator(deadEnd, 'bbb')
    expect(dead.run().steps).toHaveLength(0)
    expect(dead.accepted).toBe(false)
  })

  it('läuft über NFA.accepts', () => {
    expect(new NFA(secondLastA).accepts('ab')).toBe(true)
    expect(new NFA(secondLastA).accepts('ba')).toBe(false)
  })

  it('ein langes Wort läuft ohne Stack Overflow', () => {
    const word = 'a'.repeat(20000) + 'ab'
    expect(new NfaSimulator(secondLastA, word).run().accepted).toBe(true)
    // verworfen: alle (Zustand, Position) werden höchstens einmal untersucht
    expect(new NfaSimulator(secondLastA, 'a'.repeat(20000) + 'b' + 'b').run().accepted).toBe(false)
  })
})

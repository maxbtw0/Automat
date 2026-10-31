import { describe, expect, it } from 'vitest'
import { EPSILON } from '@/model/graph'
import { NFA, epsilonClosure, isDeterministic } from './nfa'
import { buildDocument } from './testing'
import { tokenizeWord } from './word'

/** Wörter über {a, b}, die auf „ab“ enden */
const endsWithAb = buildDocument('NFA', ['a', 'b'], { start: 'q0', finals: ['q2'] }, [
  ['q0', 'a,b', 'q0'],
  ['q0', 'a', 'q1'],
  ['q1', 'b', 'q2']
])

/** q0 –ε→ q1 –a→ q2, dazu q0 –b→ q0: akzeptiert b*a */
const withEpsilon = buildDocument('NFA', ['a', 'b'], { start: 'q0', finals: ['q2'] }, [
  ['q0', EPSILON, 'q1'],
  ['q1', 'a', 'q2'],
  ['q0', 'b', 'q0']
])

describe('NFA.accepts', () => {
  it('akzeptiert Wörter, die auf ab enden', () => {
    const nfa = new NFA(endsWithAb)
    for (const w of ['ab', 'aab', 'bab', 'abab']) expect(nfa.accepts(w), w).toBe(true)
    for (const w of ['', 'a', 'b', 'ba', 'aba']) expect(nfa.accepts(w), w).toBe(false)
  })

  it('folgt ε-Übergängen', () => {
    const nfa = new NFA(withEpsilon)
    for (const w of ['a', 'ba', 'bba']) expect(nfa.accepts(w), w).toBe(true)
    for (const w of ['', 'b', 'ab', 'aa']) expect(nfa.accepts(w), w).toBe(false)
  })

  it('akzeptiert das leere Wort, wenn ein Endzustand in der ε-Hülle des Starts liegt', () => {
    const doc = buildDocument('NFA', ['a'], { start: 'q0', finals: ['q1'] }, [['q0', EPSILON, 'q1']])
    expect(new NFA(doc).accepts('')).toBe(true)
  })

  it('verwirft Zeichen, die nicht in Σ sind', () => {
    expect(new NFA(endsWithAb).accepts('acb')).toBe(false)
  })

  it('liest „ε“ im Wort nicht über einen ε-Übergang', () => {
    const doc = buildDocument('NFA', ['a'], { start: 'q0', finals: ['q1'] }, [
      ['q0', EPSILON, 'q1']
    ])
    const nfa = new NFA(doc)
    expect(nfa.accepts('')).toBe(true)
    expect(nfa.accepts(EPSILON)).toBe(false)
    expect(new NFA(withEpsilon).accepts(`${EPSILON}a`)).toBe(false)
  })
})

describe('NFA-Simulator', () => {
  it('startet mit der ε-Hülle und liefert pro Symbol einen Schritt', () => {
    // „a“: q0 –ε→ q1 –a→ q2 – beide Zustände der Hülle tragen bei
    expect(new Set(new NFA(withEpsilon).createSimulator('a').reset().activeStateIds)).toEqual(
      new Set(['q0', 'q1'])
    )
    // „ba“: q1 kann das b nicht lesen → am Anfang nur q0 hervorgehoben
    const sim = new NFA(withEpsilon).createSimulator('ba')
    expect(sim.reset().activeStateIds).toEqual(['q0'])

    const { steps, accepted } = sim.run()
    expect(steps).toHaveLength(2)
    expect(steps[1]).toMatchObject({ index: 2, consumed: 'ba', remaining: '', activeStateIds: ['q2'] })
    expect(accepted).toBe(true)
  })

  it('endet vorzeitig, wenn keine Zustände mehr aktiv sind', () => {
    const sim = new NFA(withEpsilon).createSimulator('aab')
    const { steps, accepted } = sim.run()
    expect(steps).toHaveLength(2)
    expect(steps[1].activeStateIds).toEqual([])
    expect(accepted).toBe(false)
  })
})

describe('NFA-Simulator zeigt nur benutzte Zweige', () => {
  const trace = (word: string) =>
    new NFA(endsWithAb)
      .createSimulator(word)
      .run()
      .steps.map((step) => [step.activeStateIds.join(','), step.usedTransitionIds.join(',')])

  it('akzeptiert: nur der akzeptierende Pfad', () => {
    // q0 –a→ q0 –a→ q1 –b→ q2; t0 = q0→q0, t1 = q0→q1, t2 = q1→q2
    expect(trace('aab')).toEqual([
      ['q0', 't0'],
      ['q1', 't1'],
      ['q2', 't2']
    ])
  })

  it('verworfen: Zweige, die unterwegs sterben, verschwinden', () => {
    const steps = trace('aba')
    // nach „ab“ wäre q2 aktiv, stirbt aber beim nächsten a → nicht hervorgehoben
    expect(steps[1]).toEqual(['q0', 't0'])
    expect(steps[2][0].split(',').sort()).toEqual(['q0', 'q1'])
  })

  it('akzeptiert trotzdem richtig', () => {
    const nfa = new NFA(endsWithAb)
    expect(nfa.accepts('aab')).toBe(true)
    expect(nfa.accepts('aba')).toBe(false)
  })
})

describe('NFA.validate', () => {
  it('meldet fehlenden Startzustand', () => {
    const doc = buildDocument('NFA', ['a'], { states: ['q0'] }, [])
    expect(new NFA(doc).validate()).toContainEqual(
      expect.objectContaining({ severity: 'error', message: 'Kein Startzustand' })
    )
  })

  it('meldet Symbole außerhalb von Σ, aber nicht ε', () => {
    const doc = buildDocument('NFA', ['a'], { start: 'q0', finals: ['q0'] }, [
      ['q0', `x,${EPSILON}`, 'q0']
    ])
    const errors = new NFA(doc).validate().filter((i) => i.severity === 'error')
    expect(errors.map((i) => i.message)).toEqual(['„x“ nicht im Alphabet'])
  })

  it('meldet unerreichbare Zustände', () => {
    const doc = buildDocument('NFA', ['a'], { start: 'q0', finals: ['q0'], states: ['q9'] }, [])
    expect(new NFA(doc).validate()).toContainEqual(
      expect.objectContaining({ message: 'Nicht erreichbar: q9', stateIds: ['q9'] })
    )
  })
})

describe('Hilfsfunktionen', () => {
  it('epsilonClosure folgt ε-Ketten', () => {
    const doc = buildDocument('NFA', [], { start: 'q0' }, [
      ['q0', EPSILON, 'q1'],
      ['q1', EPSILON, 'q2']
    ])
    expect(epsilonClosure(doc.graph, ['q0']).states).toEqual(new Set(['q0', 'q1', 'q2']))
  })

  it('isDeterministic erkennt Nichtdeterminismus und ε', () => {
    expect(isDeterministic(endsWithAb)).toBe(false)
    expect(isDeterministic(withEpsilon)).toBe(false)
    const det = buildDocument('NFA', ['a'], { start: 'q0' }, [['q0', 'a', 'q1']])
    expect(isDeterministic(det)).toBe(true)
  })

  it('tokenizeWord nimmt das längste passende Symbol', () => {
    expect(tokenizeWord('x1x', ['x', 'x1', '1'])).toEqual(['x1', 'x'])
    expect(tokenizeWord('ab?', ['a', 'b'])).toEqual(['a', 'b', '?'])
  })
})

describe('isDeterministic: Schlüssel', () => {
  it('verwechselt Zustand „x|a“ mit b nicht mit Zustand „x“ mit „a|b“', () => {
    const doc = buildDocument('NFA', ['b', 'a|b'], { start: 'x', states: ['x|a'] }, [])
    doc.graph.transitions.push(
      { id: 't0', from: 'x|a', to: 'x', labels: [{ read: 'b' }] },
      { id: 't1', from: 'x', to: 'x', labels: [{ read: 'a|b' }] }
    )
    expect(isDeterministic(doc)).toBe(true)
  })
})

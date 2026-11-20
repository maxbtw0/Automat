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
  it('zeigt einen Lauf: ε-Schritt und Leseschritt sind eigene Schritte', () => {
    // „a“: q0 –ε→ q1 –a→ q2
    const sim = new NFA(withEpsilon).createSimulator('a')
    const start = sim.reset()
    expect(start).toMatchObject({ activeStateIds: ['q0'], remaining: 'a', symbol: null })
    const { steps, accepted } = sim.run()
    expect(steps).toHaveLength(2)
    expect(steps[0]).toMatchObject({ activeStateIds: ['q1'], symbol: EPSILON, consumed: '', remaining: 'a' })
    expect(steps[1]).toMatchObject({ activeStateIds: ['q2'], symbol: 'a', consumed: 'a', remaining: '' })
    expect(accepted).toBe(true)
  })

  it('verworfen: zeigt den Lauf, der am weitesten liest', () => {
    const { steps, accepted } = new NFA(withEpsilon).createSimulator('aab').run()
    // q0 –ε→ q1 –a→ q2, dort hängt der Lauf
    expect(steps.map((s) => s.activeStateIds)).toEqual([['q1'], ['q2']])
    expect(accepted).toBe(false)
  })
})

describe('NFA-Simulator: ein Lauf', () => {
  const trace = (word: string) =>
    new NFA(endsWithAb)
      .createSimulator(word)
      .run()
      .steps.map((step) => [step.activeStateIds.join(','), step.usedTransitionIds.join(',')])

  it('akzeptiert: Schleife zuerst, dann weiter', () => {
    // t0 = q0→q0 (Schleife), t1 = q0→q1, t2 = q1→q2
    expect(trace('aab')).toEqual([
      ['q0', 't0'],
      ['q1', 't1'],
      ['q2', 't2']
    ])
  })

  it('verworfen: der am weitesten lesende Lauf', () => {
    // „aba“: nach „ab“ ist Schluss (q2 hat keinen Übergang), „aba“ über q0 liest ganz
    const steps = trace('aba')
    expect(steps).toHaveLength(3)
    expect(steps.every(([state]) => !state.includes(','))).toBe(true)
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

describe('Lange ε-Ketten', () => {
  /** q0 →ε q1 →ε … →ε q(n−1) (Endzustand) →a q0: akzeptiert a* */
  function chain(n: number) {
    const rules: [string, string, string][] = []
    for (let i = 0; i + 1 < n; i++) rules.push([`q${i}`, EPSILON, `q${i + 1}`])
    rules.push([`q${n - 1}`, 'a', 'q0'])
    return buildDocument('NFA', ['a'], { start: 'q0', finals: [`q${n - 1}`] }, rules)
  }

  it('läuft ohne Stack Overflow und akzeptiert', () => {
    expect(new NFA(chain(2000)).accepts('a'.repeat(5))).toBe(true)
    expect(new NFA(chain(64)).accepts('a'.repeat(20))).toBe(true)
  })
})

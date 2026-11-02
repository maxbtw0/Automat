import { describe, expect, it } from 'vitest'
import { EPSILON } from '@/model/graph'
import { DFA } from './dfa'
import { buildDocument } from './testing'

/** Gerade Anzahl a über {a, b}: q0 = gerade (Start, Ende), q1 = ungerade */
const evenAs = buildDocument('DFA', ['a', 'b'], { start: 'q0', finals: ['q0'] }, [
  ['q0', 'a', 'q1'],
  ['q1', 'a', 'q0'],
  ['q0', 'b', 'q0'],
  ['q1', 'b', 'q1']
])

/** Nur „ab“: partieller DEA ohne Fangzustand */
const onlyAb = buildDocument('DFA', ['a', 'b'], { start: 'q0', finals: ['q2'] }, [
  ['q0', 'a', 'q1'],
  ['q1', 'b', 'q2']
])

const messages = (dfa: DFA): string[] => dfa.validate().map((i) => i.message)

describe('DFA', () => {
  it('akzeptiert Wörter, die in einem Endzustand enden', () => {
    const dfa = new DFA(evenAs)
    for (const w of ['aa', 'baab', 'abab', 'bbb']) expect(dfa.accepts(w), w).toBe(true)
  })

  it('verwirft Wörter, die in keinem Endzustand enden', () => {
    const dfa = new DFA(evenAs)
    for (const w of ['a', 'ab', 'aaa', 'bab']) expect(dfa.accepts(w), w).toBe(false)
  })

  it('verwirft Wörter, wenn für ein Symbol kein Übergang existiert', () => {
    const dfa = new DFA(onlyAb)
    expect(dfa.accepts('ab')).toBe(true)
    expect(dfa.accepts('abb')).toBe(false)
    expect(dfa.accepts('b')).toBe(false)
  })

  it('akzeptiert das leere Wort genau dann, wenn der Startzustand ein Endzustand ist', () => {
    expect(new DFA(evenAs).accepts('')).toBe(true)
    expect(new DFA(onlyAb).accepts('')).toBe(false)
  })

  it('validate() meldet fehlenden Startzustand', () => {
    const doc = buildDocument('DFA', ['a'], { states: ['q0'], finals: ['q0'] }, [['q0', 'a', 'q0']])
    expect(messages(new DFA(doc))).toContain('Kein Startzustand')
  })

  it('validate() meldet Nichtdeterminismus', () => {
    const doc = buildDocument('DFA', ['a'], { start: 'q0', finals: ['q1'] }, [
      ['q0', 'a', 'q0'],
      ['q0', 'a', 'q1'],
      ['q1', 'a', 'q1']
    ])
    const issue = new DFA(doc).validate().find((i) => i.message.startsWith('Nicht deterministisch'))
    expect(issue).toMatchObject({
      severity: 'error',
      message: 'Nicht deterministisch: q0 mit „a“',
      stateIds: ['q0'],
      transitionIds: ['t0', 't1']
    })
  })

  it('validate() meldet ε-Übergänge als Fehler', () => {
    const doc = buildDocument('DFA', ['a'], { start: 'q0', finals: ['q0'] }, [
      ['q0', `a,${EPSILON}`, 'q0']
    ])
    expect(new DFA(doc).validate()).toContainEqual(
      expect.objectContaining({ severity: 'error', message: 'Dieser Automatentyp erlaubt keine ε-Übergänge' })
    )
  })

  it('validate() warnt bei Unvollständigkeit', () => {
    expect(new DFA(onlyAb).validate()).toContainEqual(
      expect.objectContaining({ severity: 'warning', message: 'Unvollständig: q0 ohne „b“' })
    )
  })

  it('validate() findet bei einem vollständigen DEA nichts', () => {
    expect(new DFA(evenAs).validate()).toEqual([])
  })

  it('Simulator liefert pro gelesenem Symbol einen Schritt', () => {
    const sim = new DFA(evenAs).createSimulator('aba')
    expect(sim.reset()).toMatchObject({ index: 0, activeStateIds: ['q0'], symbol: null })

    const { steps, accepted } = sim.run()
    expect(steps.map((s) => [s.symbol, s.activeStateIds[0]])).toEqual([
      ['a', 'q1'],
      ['b', 'q1'],
      ['a', 'q0']
    ])
    expect(steps[0].usedTransitionIds).toEqual(['t0'])
    expect(accepted).toBe(true)
  })

  it('Simulator endet, wenn der Automat hängt', () => {
    const sim = new DFA(onlyAb).createSimulator('ba')
    const { steps, accepted } = sim.run()
    expect(steps).toHaveLength(1)
    expect(steps[0]).toMatchObject({ activeStateIds: [], consumed: 'b', remaining: 'a' })
    expect(accepted).toBe(false)
  })
})

describe('DFA – Alphabet', () => {
  it('meldet ein Zeichen, das einzeln und in einem Mehrzeichen-Symbol vorkommt', () => {
    // Σ = {a, ab, b}: „ab“ wäre das Symbol ab oder die Folge a, b
    const doc = buildDocument('DFA', ['a', 'ab', 'b'], { start: 'q0', finals: ['q1'] }, [
      ['q0', 'a, b', 'q0'],
      ['q0', 'ab', 'q1']
    ])
    const errors = new DFA(doc).validate().filter((i) => i.severity === 'error')
    expect(errors.map((i) => i.message)).toContain('„a“ einzeln und in „ab“')
  })

  it('meldet Symbole mit Leerzeichen, Komma oder Semikolon (z. B. aus einer Datei)', () => {
    const doc = buildDocument('DFA', [' ', ',', 'a;b', 'c'], { start: 'q0' }, [])
    const errors = new DFA(doc).validate().filter((i) => i.severity === 'error')
    expect(errors.map((i) => i.message)).toEqual([
      '„ “ mit Leerzeichen, Komma oder Semikolon',
      '„,“ mit Leerzeichen, Komma oder Semikolon',
      '„a;b“ mit Leerzeichen, Komma oder Semikolon'
    ])
  })
})

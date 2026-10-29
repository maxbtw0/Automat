import { describe, expect, it } from 'vitest'
import { changeDocumentType, hasTapeOperations } from '@/core/algorithms/changeType'
import { BLANK, type AutomatonDocument } from '@/model/graph'
import {
  formatLabel,
  formatTape,
  labelLines,
  nextTuringLabel,
  parseLabels,
  parseTuringRule
} from './labels'
import { createAutomaton } from './registry'
import { STEP_LIMIT, Tape, TuringSimulator } from './tmSimulator'
import type { SimulationStep, TapeSnapshot } from './types'
import { allWords, buildDocument } from './testing'

/** aⁿbⁿcⁿ (n ≥ 0): je ein a, b, c abhaken (X, Y, Z), zurück zum nächsten a, am Ende prüfen. */
const anbncn = (): AutomatonDocument =>
  buildDocument('TM', ['a', 'b', 'c'], { start: 'q0', finals: ['q5'], tape: ['X', 'Y', 'Z'] }, [
    ['q0', 'a → X, R', 'q1'],
    ['q0', 'Y → Y, R', 'q4'],
    ['q0', '# → #, N', 'q5'],
    ['q1', 'a → a, R; Y → Y, R', 'q1'],
    ['q1', 'b → Y, R', 'q2'],
    ['q2', 'b → b, R; Z → Z, R', 'q2'],
    ['q2', 'c → Z, L', 'q3'],
    ['q3', 'a → a, L; b → b, L; Y → Y, L; Z → Z, L', 'q3'],
    ['q3', 'X → X, R', 'q0'],
    ['q4', 'Y → Y, R; Z → Z, R', 'q4'],
    ['q4', '# → #, N', 'q5']
  ])

/** Binärzahl + 1: nach rechts ans Ende, dann mit Übertrag nach links. */
const increment = (): AutomatonDocument =>
  buildDocument('TM', ['0', '1'], { start: 'q0', finals: ['q2'] }, [
    ['q0', '0 → 0, R; 1 → 1, R', 'q0'],
    ['q0', '# → #, L', 'q1'],
    ['q1', '1 → 0, L', 'q1'],
    ['q1', '0 → 1, N; # → 1, N', 'q2']
  ])

const errors = (doc: AutomatonDocument): string[] =>
  createAutomaton(doc)
    .validate()
    .filter((i) => i.severity === 'error')
    .map((i) => i.message)

const isAnbncn = (w: string): boolean => {
  const n = w.length / 3
  return w === 'a'.repeat(n) + 'b'.repeat(n) + 'c'.repeat(n)
}

describe('Turingmaschine – Regeln als Text', () => {
  const doc = buildDocument('TM', ['a'], {}, [])

  it('formatiert „a → b, R“ und zeigt eine Zeile pro Regel', () => {
    expect(formatLabel({ read: 'a', write: 'X', move: 'R' })).toBe('a → X, R')
    expect(labelLines([
      { read: 'a', write: 'a', move: 'R' },
      { read: BLANK, write: BLANK, move: 'L' }
    ])).toEqual(['a → a, R', '# → #, L'])
  })

  it('liest →, ->, /, „_“ als Blank und „a → R“ als „a → a, R“', () => {
    expect(parseLabels('a → X, R; _ -> _, l; a / N', doc)).toEqual({
      labels: [
        { read: 'a', write: 'X', move: 'R' },
        { read: BLANK, write: BLANK, move: 'L' },
        { read: 'a', write: 'a', move: 'N' }
      ]
    })
  })

  it('das Blank ist #, das Kästchen □ meint beim Eingeben ebenfalls das Blank', () => {
    expect(BLANK).toBe('#')
    expect(parseLabels('□ → □, R', doc)).toEqual({
      labels: [{ read: '#', write: '#', move: 'R' }]
    })
  })

  it('liest die Kurzform „a A R“ ohne Pfeil, Bewegung auch klein', () => {
    expect(parseLabels('a A R; a A r; b l; _ # n; a,A,R', doc)).toEqual({
      labels: [
        { read: 'a', write: 'A', move: 'R' },
        { read: 'b', write: 'b', move: 'L' },
        { read: BLANK, write: BLANK, move: 'N' }
      ]
    })
    expect(parseLabels('a → A, l', doc)).toEqual({ labels: [{ read: 'a', write: 'A', move: 'L' }] })
  })

  it('„#“ ist bei einem anderen Blank ein gewöhnliches Bandsymbol, nur leer und „_“ meinen das Blank', () => {
    expect(parseTuringRule('# → #, R', 'X')).toEqual({ read: '#', write: '#', move: 'R' })
    expect(parseTuringRule('# # R', 'X')).toEqual({ read: '#', write: '#', move: 'R' })
    expect(parseTuringRule('# R', 'X')).toEqual({ read: '#', write: '#', move: 'R' })
    expect(parseTuringRule('_ → _, L', 'X')).toEqual({ read: 'X', write: 'X', move: 'L' })
    expect(parseTuringRule('→ , N', 'X')).toEqual({ read: 'X', write: 'X', move: 'N' })
    expect(parseTuringRule('a _ R', 'X')).toEqual({ read: 'a', write: 'X', move: 'R' })
    // Beim üblichen Blank bleibt „#“ das Blank
    expect(parseTuringRule('# → #, R', BLANK)).toEqual({ read: BLANK, write: BLANK, move: 'R' })
  })

  it('meldet Text ohne gültige Bewegung', () => {
    expect(parseLabels('a → b, Q', doc)).toEqual({
      error: '„a → b, Q“ ist keine Bandregel (a A R)'
    })
    expect(parseLabels('a A Q', doc)).toHaveProperty('error')
    expect(parseLabels('a b c R', doc)).toHaveProperty('error')
    expect(parseLabels('a, b', doc)).toHaveProperty('error')
  })

  it('schlägt als neue Regel das erste noch nicht gelesene Bandsymbol vor', () => {
    expect(nextTuringLabel([{ read: 'a', write: 'a', move: 'R' }], ['a', 'b', BLANK])).toEqual({
      read: 'b',
      write: 'b',
      move: 'N'
    })
    expect(nextTuringLabel([{ read: 'a' }], ['a'])).toBeNull()
  })

  it('zeigt das Band mit dem Kopf in Klammern', () => {
    expect(formatTape({ start: -1, symbols: [BLANK, 'X', 'a'] }, 0)).toBe('#[X]a')
  })
})

describe('Turingmaschine – Prüfung', () => {
  it('aⁿbⁿcⁿ hat keine Fehler', () => {
    expect(errors(anbncn())).toEqual([])
  })

  it('meldet zwei Regeln für dasselbe Bandsymbol', () => {
    const doc = buildDocument('TM', ['a'], { start: 'q0' }, [
      ['q0', 'a → a, R', 'q0'],
      ['q0', 'a → a, L', 'q1']
    ])
    expect(errors(doc)).toEqual(['Nicht deterministisch: q0 liest „a“ mehrfach'])
  })

  it('meldet Symbole außerhalb von Γ, Σ ⊄ Γ und ein Blank in Σ', () => {
    const doc = buildDocument('TM', ['a'], { start: 'q0' }, [['q0', 'a → X, R', 'q0']])
    expect(errors(doc)).toEqual(['„X“ nicht im Bandalphabet'])
    doc.tape = { alphabet: [BLANK], blank: BLANK }
    doc.alphabet = ['a', BLANK]
    expect(errors(doc)).toEqual(
      expect.arrayContaining([
        `Blank „${BLANK}“ darf nicht in Σ liegen`,
        '„a“ aus Σ fehlt im Bandalphabet'
      ])
    )
  })
})

describe('Turingmaschine – Simulation', () => {
  it('erkennt genau aⁿbⁿcⁿ (alle Wörter bis Länge 7)', () => {
    const tm = createAutomaton(anbncn())
    for (const w of allWords(['a', 'b', 'c'], 7)) expect(tm.accepts(w), w).toBe(isAnbncn(w))
  })

  it('rechnet Binärzahl + 1', () => {
    const cases: [string, string][] = [
      ['1011', '1100'],
      ['111', '1000'],
      ['0', '1'],
      ['', '1']
    ]
    for (const [input, output] of cases) {
      const sim = new TuringSimulator(increment(), input)
      expect(sim.run().accepted, input).toBe(true)
      expect(sim.output.join(''), input).toBe(output)
    }
  })

  it('hält in einem Nicht-Endzustand → verworfen', () => {
    const doc = buildDocument('TM', ['a'], { start: 'q0', finals: ['q1'] }, [
      ['q0', 'a → a, R', 'q0']
    ])
    const sim = createAutomaton(doc).createSimulator('aa')
    expect(sim.run().accepted).toBe(false)
    expect(sim.abortReason).toBeNull()
  })

  it('bricht eine Endlosschleife nach dem Schrittlimit ab', () => {
    const doc = buildDocument('TM', ['a'], { start: 'q0', finals: ['q0'] }, [
      ['q0', 'a → a, N', 'q0']
    ])
    const sim = createAutomaton(doc).createSimulator('a')
    const { accepted, steps } = sim.run()
    expect(accepted).toBe(false)
    expect(steps).toHaveLength(STEP_LIMIT)
    expect(sim.abortReason).toBe('Abbruch nach 10.000 Schritten')
  })

  it('läuft auch links von Zelle 0 und zeigt Band und Kopf in jedem Schritt', () => {
    const doc = buildDocument('TM', ['a'], { start: 'q0', finals: ['q1'], tape: ['X'] }, [
      ['q0', 'a → X, L', 'q0'],
      ['q0', '# → X, N', 'q1']
    ])
    const sim = createAutomaton(doc).createSimulator('a')
    const start = sim.reset()
    expect(start).toMatchObject({ head: 0, tape: { start: 0, symbols: ['a'] } })
    const [first, second] = sim.run().steps
    expect(first).toMatchObject({ head: -1, tape: { start: -1, symbols: [BLANK, 'X'] } })
    expect(first.label).toEqual({ read: 'a', write: 'X', move: 'L' })
    expect(second).toMatchObject({ head: -1, tape: { start: -1, symbols: ['X', 'X'] } })
    expect(sim.accepted).toBe(true)
  })

  it('verwirft Eingaben außerhalb von Σ sofort – auch wenn das Symbol in Γ liegt', () => {
    const doc = buildDocument('TM', ['a'], { start: 'q0', finals: ['q0'], tape: ['X'] }, [])
    const tm = createAutomaton(doc)
    expect(errors(doc)).toEqual([])
    expect(tm.accepts('')).toBe(true)
    expect(tm.accepts('a')).toBe(true)
    for (const word of ['b', 'ab', 'X', BLANK]) expect(tm.accepts(word), word).toBe(false)

    const sim = tm.createSimulator('ab')
    const start = sim.reset()
    expect(start.tape).toEqual({ start: 0, symbols: ['a', 'b'] })
    expect(sim.isFinished).toBe(true)
    expect(sim.accepted).toBe(false)
    expect(sim.abortReason).toBe('„b“ nicht in Σ')
    expect(sim.run().steps).toEqual([])
  })

  it('speichert nur beschriebene Zellen', () => {
    const tape = new Tape(BLANK, ['a', 'b'])
    tape.write(1, BLANK)
    expect(tape.read(5)).toBe(BLANK)
    expect(tape.content()).toEqual(['a'])
    expect(tape.snapshot(3)).toEqual({ start: 0, symbols: ['a', BLANK, BLANK, BLANK] })
  })
})

describe('Turingmaschine – Typwechsel', () => {
  it('DEA → TM: „a“ wird „a → a, R“, Γ = Σ ∪ {#}', () => {
    const dfa = buildDocument('DFA', ['a', 'b'], { start: 'q0' }, [['q0', 'a,b', 'q0']])
    const tm = changeDocumentType(dfa, 'TM')
    expect(tm.tape).toEqual({ alphabet: ['a', 'b', BLANK], blank: BLANK })
    expect(tm.graph.transitions[0].labels).toEqual([
      { read: 'a', write: 'a', move: 'R' },
      { read: 'b', write: 'b', move: 'R' }
    ])
  })

  it('KA → TM lässt ε-Regeln weg, TM → NEA behält nur Symbole aus Σ', () => {
    const pda = buildDocument('NPDA', ['a'], { start: 'q0' }, [['q0', 'a, # → #; ε, # → ε', 'q0']])
    expect(changeDocumentType(pda, 'TM').graph.transitions[0].labels).toEqual([
      { read: 'a', write: 'a', move: 'R' }
    ])
    const tm = anbncn()
    expect(hasTapeOperations(tm)).toBe(true)
    const nfa = changeDocumentType(tm, 'NFA')
    expect(nfa.tape).toBeUndefined()
    expect(nfa.graph.transitions.find((t) => t.from === 'q3' && t.to === 'q3')?.labels).toEqual([
      { read: 'a' },
      { read: 'b' }
    ])
  })
})

/** Band pro Schritt wie früher: nach jedem Schritt die ganze Kopie des Bands */
function eagerTapes(word: string[], steps: SimulationStep[]): TapeSnapshot[] {
  const tape = new Tape(BLANK, word)
  return steps.map((step, i) => {
    if (i > 0 && step.label) tape.write(steps[i - 1].head ?? 0, step.label.write ?? step.label.read)
    return tape.snapshot(step.head ?? 0)
  })
}

describe('Turingmaschine – Bandverlauf', () => {
  const machines: [string, AutomatonDocument, string][] = [
    ['aⁿbⁿcⁿ', anbncn(), 'a'.repeat(15) + 'b'.repeat(15) + 'c'.repeat(15)],
    ['Binär + 1', increment(), '1'.repeat(300)],
    [
      'schreibt nach rechts',
      buildDocument('TM', [], { start: 'q0', finals: [], tape: ['X'] }, [['q0', '# → X, R', 'q0']]),
      ''
    ]
  ]

  for (const [name, doc, word] of machines) {
    it(`liefert in jedem Schritt dasselbe Band wie eine vollständige Kopie (${name})`, () => {
      const sim = new TuringSimulator(doc, word, 1500)
      const steps = [sim.reset(), ...sim.run().steps]
      expect(steps.length).toBeGreaterThan(300)
      const expected = eagerTapes([...word], steps)
      // der Reihe nach, rückwärts und durcheinander – über die Checkpoints hinweg
      steps.forEach((step, i) => expect(step.tape, `Schritt ${i}`).toEqual(expected[i]))
      for (let i = steps.length - 1; i >= 0; i -= 7) expect(steps[i].tape).toEqual(expected[i])
      for (let k = 0; k < 200; k++) {
        const i = (k * 7919) % steps.length
        expect(steps[i].tape, `Schritt ${i}`).toEqual(expected[i])
      }
      const split = (i: number): number => (steps[i].head ?? 0) - expected[i].start
      steps.forEach((step, i) => {
        expect(step.consumed).toBe(expected[i].symbols.slice(0, split(i)).join(''))
        expect(step.remaining).toBe(expected[i].symbols.slice(split(i)).join(''))
      })
    })
  }

  it('Schritte eines früheren Laufs behalten nach reset ihr Band', () => {
    const sim = new TuringSimulator(increment(), '1011')
    const first = [sim.reset(), ...sim.run().steps]
    const before = first.map((s) => s.tape)
    sim.reset()
    sim.run()
    expect(first.map((s) => s.tape)).toEqual(before)
    expect(first.at(-1)?.tape).toEqual({ start: 0, symbols: ['1', '1', '0', '0'] })
  })

  it('speichert linear viele Bandzellen statt einer Kopie pro Schritt', () => {
    const doc = buildDocument('TM', [], { start: 'q0', finals: [], tape: ['X'] }, [
      ['q0', '# → X, R', 'q0']
    ])
    for (const count of [1000, 2000, 10000]) {
      const sim = new TuringSimulator(doc, '', count)
      expect(sim.run().steps).toHaveLength(count)
      // früher: 1 + 2 + … + count Zellen (2000 Schritte = 2 003 000)
      expect(sim.storedTapeCells).toBeLessThanOrEqual(3 * count + 64)
    }
  })
})

import { describe, expect, it } from 'vitest'
import { changeDocumentType, hasStackOperations } from '@/core/algorithms/changeType'
import { DEFAULT_SIMULATION } from '@shared/simulationSettings'
import { UndecidedError } from './errors'
import { setSimulationLimits } from './limits'
import { createAutomaton } from './registry'
import { formatStack } from './labels'
import { STACK_LIMIT, searchPushdown } from './pdaSimulator'
import { allWords, buildDocument } from './testing'
import type { AutomatonDocument } from '@/model/graph'

/** aⁿbⁿ (n ≥ 0) als DKA mit Akzeptanz über Endzustand */
const anbn = (type: 'DPDA' | 'NPDA' = 'DPDA') =>
  buildDocument(type, ['a', 'b'], { start: 'q0', finals: ['q0', 'q3'], stack: ['A', '#'] }, [
    ['q0', 'a, # → A#', 'q1'],
    ['q1', 'a, A → AA', 'q1'],
    ['q1', 'b, A → ε', 'q2'],
    ['q2', 'b, A → ε', 'q2'],
    ['q2', 'ε, # → #', 'q3']
  ])

/** Palindrome gerader Länge w·wᴿ – braucht Nichtdeterminismus (Mitte raten) */
const evenPalindromes = (type: 'DPDA' | 'NPDA' = 'NPDA') =>
  buildDocument(type, ['a', 'b'], { start: 'q0', finals: ['q2'], stack: ['A', 'B', '#'] }, [
    ['q0', 'a, # → A#; a, A → AA; a, B → AB; b, # → B#; b, A → BA; b, B → BB', 'q0'],
    ['q0', 'ε, A → A; ε, B → B; ε, # → #', 'q1'],
    ['q1', 'a, A → ε; b, B → ε', 'q1'],
    ['q1', 'ε, # → #', 'q2']
  ])

const errors = (doc: ReturnType<typeof anbn>): string[] =>
  createAutomaton(doc)
    .validate()
    .filter((i) => i.severity === 'error')
    .map((i) => i.message)

const accepts = (doc: ReturnType<typeof anbn>, word: string): boolean =>
  createAutomaton(doc).accepts(word)

const isAnbn = (w: string): boolean => {
  const n = w.length / 2
  return w === 'a'.repeat(n) + 'b'.repeat(n)
}

describe('Kellerautomat – Sprache', () => {
  it('DKA erkennt aⁿbⁿ (alle Wörter bis Länge 8)', () => {
    const doc = anbn()
    for (const w of allWords(['a', 'b'], 8)) expect(accepts(doc, w), w).toBe(isAnbn(w))
  })

  it('NKA erkennt Palindrome gerader Länge', () => {
    const doc = evenPalindromes()
    for (const w of allWords(['a', 'b'], 6)) {
      const palindrome = w.length % 2 === 0 && w === [...w].reverse().join('')
      expect(accepts(doc, w), w).toBe(palindrome)
    }
  })

  it('akzeptiert mit leerem Stack ohne Endzustände', () => {
    const doc = buildDocument(
      'NPDA',
      ['a', 'b'],
      { start: 'q0', stack: ['A', '#'], acceptance: 'empty' },
      [
        ['q0', 'a, # → A#; a, A → AA', 'q0'],
        ['q0', 'b, A → ε', 'q1'],
        ['q1', 'b, A → ε', 'q1'],
        ['q1', 'ε, # → ε', 'q1']
      ]
    )
    expect(
      createAutomaton(doc)
        .validate()
        .filter((i) => i.severity === 'error')
    ).toEqual([])
    for (const w of allWords(['a', 'b'], 6)) {
      expect(accepts(doc, w), w).toBe(isAnbn(w) && w.length > 0)
    }
  })

  it('hält bei leerem Stack – keine Regel passt mehr', () => {
    const doc = buildDocument('NPDA', ['a'], { start: 'q0', finals: ['q0'] }, [
      ['q0', 'a, # → ε', 'q0']
    ])
    expect(accepts(doc, 'a')).toBe(true)
    expect(accepts(doc, 'aa')).toBe(false)
  })
})

describe('Kellerautomat – Simulation', () => {
  it('zeigt jeden Schritt mit Regel und Stack (oben links)', () => {
    const sim = createAutomaton(anbn()).createSimulator('ab')
    const steps = [sim.reset(), ...sim.run().steps]

    expect(steps.map((s) => s.activeStateIds[0])).toEqual(['q0', 'q1', 'q2', 'q3'])
    expect(steps.map((s) => formatStack(s.stack ?? []))).toEqual(['#', 'A#', '#', '#'])
    expect(steps.map((s) => s.symbol)).toEqual([null, 'a', 'b', 'ε'])
    expect(steps.map((s) => s.inputPosition)).toEqual([0, 1, 2, 2])
    expect(steps[1].usedTransitionIds).toEqual(['t0'])
    expect(steps[3].remaining).toBe('')
    expect(sim.accepted).toBe(true)
  })

  it('zeigt beim Verwerfen den Lauf, der am weitesten liest', () => {
    const sim = createAutomaton(anbn()).createSimulator('aab')
    const { accepted, steps } = sim.run()
    expect(accepted).toBe(false)
    expect(sim.undecided).toBe(false)
    expect(steps.at(-1)?.inputPosition).toBe(3)
    expect(formatStack(steps.at(-1)?.stack ?? [])).toBe('A#')
  })

  it('bricht ε-Schleifen über die Stackhöhe ab', () => {
    const doc = buildDocument('NPDA', ['a'], { start: 'q0', finals: ['q1'], stack: ['A', '#'] }, [
      ['q0', 'ε, # → A#; ε, A → AA', 'q0']
    ])
    const sim = createAutomaton(doc).createSimulator('a')
    expect(sim.run().accepted).toBe(false)
    expect(sim.abortReason).toBe(`Abbruch bei Stackhöhe ${STACK_LIMIT}`)
    expect(sim.undecided).toBe(true)
  })

  it('verwirft ein Wort mit Zeichen außerhalb von Σ, statt am Limit abzubrechen', () => {
    for (const type of ['DPDA', 'NPDA'] as const) {
      const doc = buildDocument(type, ['a'], { start: 'q0', finals: ['q0'] }, [
        ['q0', 'ε, # → ##', 'q0']
      ])
      const automaton = createAutomaton(doc)
      expect(automaton.validate()).toEqual([])
      expect(automaton.accepts('')).toBe(true)
      for (const word of ['ε', 'eps', 'aε']) {
        const sim = automaton.createSimulator(word)
        expect(sim.run().accepted, word).toBe(false)
        expect(sim.undecided, word).toBe(false)
        expect(sim.abortReason, word).toBeNull()
        expect(automaton.accepts(word), word).toBe(false)
      }
      // Wörter über Σ dürfen weiter am Limit abbrechen
      expect(() => automaton.accepts('a')).toThrow(UndecidedError)
    }
  })

  it('verwechselt keine Konfigurationen, wenn IDs oder Stacksymbole „|“ enthalten', () => {
    // (a, 0, [1|y]) und (a|0, 1, [y]) ergaben früher denselben Schlüssel „a|0|1|y“
    const state = (id: string, isStart = false, isFinal = false) => ({
      id,
      label: id,
      x: 0,
      y: 0,
      isStart,
      isFinal
    })
    const doc: AutomatonDocument = {
      type: 'NPDA',
      alphabet: ['x'],
      stack: { alphabet: ['1|y', 'y', '#'], start: '#', acceptance: 'final' },
      graph: {
        states: [state('q0', true), state('a'), state('a|0', false, true)],
        transitions: [
          { id: 't0', from: 'q0', to: 'a', labels: [{ read: 'ε', pop: '#', push: ['1|y'] }] },
          { id: 't1', from: 'q0', to: 'a|0', labels: [{ read: 'x', pop: '#', push: ['y'] }] }
        ]
      }
    }
    expect(searchPushdown(doc, ['x']).accepted).toBe(true)
    expect(createAutomaton(doc).accepts('x')).toBe(true)
  })

  it('genau erreichte Grenzen ohne weitere Konfigurationen sind kein Abbruch', () => {
    const empty = buildDocument('DPDA', ['a'], { start: 'q0', finals: [] }, [])
    expect(searchPushdown(empty, [], { configurations: 1, stackHeight: 10 }).abortReason).toBeNull()

    // (q0, a, #) → (q1, ε, A#): zwei Konfigurationen, Stackhöhe 2
    const doc = buildDocument('DPDA', ['a'], { start: 'q0', finals: [], stack: ['A', '#'] }, [
      ['q0', 'a, # → A#', 'q1']
    ])
    const exact = searchPushdown(doc, ['a'], { configurations: 2, stackHeight: 2 })
    expect(exact.accepted).toBe(false)
    expect(exact.abortReason).toBeNull()
    expect(exact.path.map((c) => c.state)).toEqual(['q0', 'q1'])

    expect(searchPushdown(doc, ['a'], { configurations: 1, stackHeight: 2 }).abortReason).toBe(
      'Abbruch nach 1 Konfigurationen'
    )
    expect(searchPushdown(doc, ['a'], { configurations: 2, stackHeight: 1 }).abortReason).toBe(
      'Abbruch bei Stackhöhe 1'
    )
  })
})

describe('Kellerautomat – Prüfung', () => {
  it('aⁿbⁿ ist ein gültiger DKA', () => {
    expect(errors(anbn())).toEqual([])
  })

  it('meldet Nichtdeterminismus beim DKA, nicht beim NKA', () => {
    expect(errors(evenPalindromes('DPDA')).some((m) => m.startsWith('Nicht deterministisch'))).toBe(
      true
    )
    expect(errors(evenPalindromes('NPDA'))).toEqual([])
  })

  it('ε-Eingabe und gleiches Stacksymbol sind beim DKA ein Konflikt', () => {
    const doc = buildDocument('DPDA', ['a'], { start: 'q0', stack: ['#'] }, [
      ['q0', 'a, # → #', 'q0'],
      ['q0', 'ε, # → #', 'q1']
    ])
    expect(errors(doc)).toEqual(['Nicht deterministisch: q0 mit „a, # → #“ und „ε, # → #“'])
  })

  it('meldet Symbole außerhalb von Σ und Γ', () => {
    const doc = buildDocument('NPDA', ['a'], { start: 'q0', finals: ['q0'], stack: ['#'] }, [
      ['q0', 'c, X → Y#', 'q0']
    ])
    expect(errors(doc)).toEqual([
      '„c“ nicht im Alphabet',
      '„X“ nicht im Stackalphabet',
      '„Y“ nicht im Stackalphabet'
    ])
  })

  it('meldet ein Stack-Startsymbol außerhalb von Γ', () => {
    const doc = buildDocument('NPDA', [], { start: 'q0', stack: ['A'], stackStart: 'Z' }, [])
    expect(errors(doc)).toEqual(['Stack-Startsymbol „Z“ nicht in Γ'])
  })

  it('verlangt ein Stack-Startsymbol', () => {
    const doc = buildDocument('NPDA', [], { start: 'q0', stack: ['#'], stackStart: null }, [])
    expect(errors(doc)).toEqual(['Kein Stack-Startsymbol'])
  })

  it('ε als Top of Stack ist nicht erlaubt (z. B. aus alten Dateien)', () => {
    const doc = buildDocument('NPDA', ['a'], { start: 'q0', finals: ['q0'] }, [])
    doc.graph.transitions = [
      { id: 't0', from: 'q0', to: 'q0', labels: [{ read: 'a', pop: 'ε', push: ['#'] }] }
    ]
    expect(errors(doc)).toEqual(['ε als Top of Stack nicht erlaubt'])
  })

  it('ε im Push-Wort ist nicht erlaubt (leeres Wort = [], z. B. aus Dateien)', () => {
    const doc = buildDocument('NPDA', ['a'], { start: 'q0', finals: ['q0'] }, [])
    doc.graph.transitions = [
      { id: 't0', from: 'q0', to: 'q0', labels: [{ read: 'a', pop: '#', push: ['ε'] }] }
    ]
    expect(errors(doc)).toEqual(['ε im Push-Wort nicht erlaubt'])
  })
})

describe('Typwechsel', () => {
  it('NEA → NKA: Regeln legen das Top of Stack zurück, die Sprache bleibt gleich', () => {
    const nfa = buildDocument('NFA', ['a', 'b'], { start: 'q0', finals: ['q1'] }, [
      ['q0', 'a,b', 'q0'],
      ['q0', 'b', 'q1']
    ])
    const pda = changeDocumentType(nfa, 'NPDA')

    expect(pda.stack).toEqual({ alphabet: ['#'], start: '#', acceptance: 'final' })
    expect(pda.graph.transitions[0].labels).toEqual([
      { read: 'a', pop: '#', push: ['#'] },
      { read: 'b', pop: '#', push: ['#'] }
    ])
    expect(errors(pda)).toEqual([])
    expect(hasStackOperations(pda)).toBe(false)
    for (const w of allWords(['a', 'b'], 5)) {
      expect(accepts(pda, w), w).toBe(createAutomaton(nfa).accepts(w))
    }
  })

  it('KA → NEA: nur die gelesenen Symbole bleiben, Γ entfällt', () => {
    const nfa = changeDocumentType(anbn(), 'NFA')
    expect(nfa.stack).toBeUndefined()
    expect(nfa.graph.transitions[0].labels).toEqual([{ read: 'a' }])
    expect(hasStackOperations(anbn())).toBe(true)
  })

  it('DKA ↔ NKA ändert nur den Typ', () => {
    const doc = anbn()
    expect(changeDocumentType(doc, 'NPDA')).toEqual({ ...doc, type: 'NPDA' })
  })
})

describe('Push mit mehreren Symbolen', () => {
  it('„a, # → ABC#“ legt #, C, B, A ab – A liegt danach oben', () => {
    const doc = buildDocument(
      'NPDA',
      ['a'],
      { start: 'q0', finals: ['q1'], stack: ['A', 'B', 'C', '#'] },
      [['q0', 'a, # → ABC#', 'q1']]
    )
    const sim = createAutomaton(doc).createSimulator('a')
    const [, step] = [sim.reset(), sim.step()]
    expect(step.stack).toEqual(['#', 'C', 'B', 'A'])
    expect(formatStack(step.stack ?? [])).toBe('ABC#')
  })
})

describe('Kellerautomat – accepts am Limit', () => {
  // „ab“ braucht kurz Stackhöhe 2
  const doc = buildDocument(
    'NPDA',
    ['a', 'b'],
    { start: 'q0', finals: ['q2'], stack: ['A', '#'] },
    [
      ['q0', 'a, # → A#', 'q1'],
      ['q1', 'b, A → ε', 'q2']
    ]
  )

  it('meldet unentschieden statt false, wenn die Stackhöhe zu knapp ist', () => {
    try {
      setSimulationLimits({ ...DEFAULT_SIMULATION, pdaStackLimit: 1 })
      expect(() => createAutomaton(doc).accepts('ab')).toThrow(UndecidedError)
      setSimulationLimits({ ...DEFAULT_SIMULATION, pdaStackLimit: 2 })
      expect(createAutomaton(doc).accepts('ab')).toBe(true)
      expect(createAutomaton(doc).accepts('b')).toBe(false)
    } finally {
      setSimulationLimits(DEFAULT_SIMULATION)
    }
  })
})

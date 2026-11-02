import { describe, expect, it } from 'vitest'
import { changeDocumentType } from '@/core/algorithms/changeType'
import { mealyToMoore, mooreToMealy } from '@/core/algorithms/transducer'
import { deserializeDocument, serializeDocument } from '@/model/serialization'
import { describeOutcome, describeStep } from './describe'
import { formatLabelsInline, parseLabels, stateText } from './labels'
import { createAutomaton } from './registry'
import { allWords, buildDocument } from './testing'
import type { Transducer } from './transducer'
import { TransducerSimulator } from './transducerSimulator'

const translate = (doc: Parameters<typeof createAutomaton>[0], word: string): string | null =>
  (createAutomaton(doc) as Transducer).translate(word)?.join('') ?? null

/** Mealy: gibt 1 aus, wenn sich das Zeichen gegenüber dem vorigen ändert (Flankenerkennung). */
const edges = buildDocument('MEALY', ['0', '1'], { start: 's', output: ['0', '1'] }, [
  ['s', '0/0', 'n'],
  ['s', '1/0', 'e'],
  ['n', '0/0', 'n'],
  ['n', '1/1', 'e'],
  ['e', '1/0', 'e'],
  ['e', '0/1', 'n']
])

const expectedEdges = (w: string): string =>
  [...w].map((c, i) => (i > 0 && c !== w[i - 1] ? '1' : '0')).join('')

/** Moore: Rest einer Binärzahl modulo 3 nach jedem gelesenen Bit. */
const mod3 = buildDocument(
  'MOORE',
  ['0', '1'],
  { start: 'r0', output: ['0', '1', '2'], outputs: { r0: '0', r1: '1', r2: '2' } },
  [
    ['r0', '0', 'r0'],
    ['r0', '1', 'r1'],
    ['r1', '0', 'r2'],
    ['r1', '1', 'r0'],
    ['r2', '0', 'r1'],
    ['r2', '1', 'r2']
  ]
)

const expectedMod3 = (w: string): string =>
  ['0', ...[...w].map((_, i) => String(parseInt(w.slice(0, i + 1), 2) % 3))].join('')

describe('Mealy-Automat', () => {
  it('übersetzt jedes Wort wie erwartet', () => {
    expect(createAutomaton(edges).validate().filter((i) => i.severity !== 'info')).toEqual([])
    for (const w of allWords(['0', '1'], 6)) expect(translate(edges, w), w).toBe(expectedEdges(w))
  })

  it('Ausgabe ist ein Wort aus Δ*, auch ε oder mehrere Symbole', () => {
    const doc = buildDocument('MEALY', ['a', 'b'], { start: 'q', output: ['x', 'y'] }, [
      ['q', 'a/xy, b/ε', 'q']
    ])
    expect(translate(doc, 'abba')).toBe('xyxy')
    expect(translate(doc, '')).toBe('')
  })

  it('bricht ab, wenn ein Übergang fehlt, und behält die Ausgabe bis dahin', () => {
    const doc = buildDocument('MEALY', ['a', 'b'], { start: 'q', output: ['1'] }, [
      ['q', 'a/1', 'q']
    ])
    const sim = new TransducerSimulator(doc, 'aab')
    sim.run()
    expect(sim.isFinished).toBe(true)
    expect(sim.accepted).toBe(false)
    expect(sim.output).toEqual(['1', '1'])
    expect(sim.abortReason).toBe('Kein Übergang von q mit „b“')
    expect(translate(doc, 'aab')).toBeNull()
  })

  it('jeder Schritt trägt die Ausgabe Stück für Stück', () => {
    const sim = new TransducerSimulator(edges, '011')
    const steps = [sim.reset(), ...sim.run().steps]
    expect(steps.map((s) => s.output)).toEqual([
      [[]],
      [[], ['0']],
      [[], ['0'], ['1']],
      [[], ['0'], ['1'], ['0']]
    ])
    expect(steps[2].label).toEqual({ read: '1', output: ['1'] })
    expect(steps.map((s) => s.activeStateIds)).toEqual([['s'], ['n'], ['e'], ['e']])
  })

  it('meldet Nichtdeterminismus auch bei gleicher Eingabe am selben Übergang', () => {
    const doc = buildDocument('MEALY', ['a'], { start: 'q', output: ['0', '1'] }, [
      ['q', 'a/0, a/1', 'q']
    ])
    const messages = createAutomaton(doc).validate().map((i) => i.message)
    expect(messages).toContain('Nicht deterministisch: q mit „a“')
  })

  it('meldet Ausgaben außerhalb von Δ, ε-Regeln und fehlende Übergänge', () => {
    const doc = buildDocument('MEALY', ['a', 'b'], { start: 'q', output: ['0'] }, [
      ['q', 'a/2, ε/0', 'q']
    ])
    const issues = createAutomaton(doc).validate()
    expect(issues).toContainEqual({
      severity: 'error',
      message: '„2“ nicht im Ausgabealphabet',
      transitionIds: ['t0']
    })
    expect(issues.map((i) => i.message)).toContain('Dieser Automatentyp erlaubt keine ε-Übergänge')
    expect(issues.map((i) => i.message)).toContain('Unvollständig: q ohne „b“')
    // Keine Endzustände nötig
    expect(issues.map((i) => i.message)).not.toContain('Kein Endzustand')
  })
})

describe('Moore-Automat', () => {
  it('gibt vor dem ersten Zeichen λ(z₀) aus und danach die Ausgabe jedes Zustands', () => {
    expect(createAutomaton(mod3).validate().filter((i) => i.severity !== 'info')).toEqual([])
    for (const w of allWords(['0', '1'], 6)) expect(translate(mod3, w), w).toBe(expectedMod3(w))
  })

  it('Schritt 0 trägt die Ausgabe des Startzustands, Regeln haben keine Ausgabe', () => {
    const sim = new TransducerSimulator(mod3, '1')
    const steps = [sim.reset(), ...sim.run().steps]
    expect(steps.map((s) => s.output)).toEqual([[['0']], [['0'], ['1']]])
    expect(steps[1].label).toBeUndefined()
  })

  it('meldet Zustandsausgaben außerhalb von Δ am Zustand', () => {
    const doc = buildDocument('MOORE', ['a'], { start: 'q', output: ['0'], outputs: { q: 'x' } }, [
      ['q', 'a', 'q']
    ])
    expect(createAutomaton(doc).validate()).toContainEqual({
      severity: 'error',
      message: '„x“ nicht im Ausgabealphabet',
      stateIds: ['q']
    })
  })
})

describe('Umwandlung Mealy ↔ Moore', () => {
  it('Mealy → Moore übersetzt jedes Wort gleich', () => {
    const moore = mealyToMoore(edges)
    expect(moore.type).toBe('MOORE')
    expect(createAutomaton(moore).validate().filter((i) => i.severity === 'error')).toEqual([])
    for (const w of allWords(['0', '1'], 6)) expect(translate(moore, w), w).toBe(expectedEdges(w))
  })

  it('Mealy → Moore teilt Zustände nach der Ausgabe auf, mit der man sie betritt', () => {
    const moore = mealyToMoore(edges)
    // s nur als Start (ε); n mit 0 und 1; e mit 0 und 1
    expect(moore.graph.states.map((s) => stateText(s, moore)).sort()).toEqual([
      'e_0/0',
      'e_1/1',
      'n_0/0',
      'n_1/1',
      's/ε'
    ])
    expect(moore.graph.states.find((s) => s.isStart)?.label).toBe('s')
  })

  it('Moore → Mealy übersetzt gleich, bis auf die Ausgabe des Startzustands', () => {
    const mealy = mooreToMealy(mod3)
    expect(mealy.type).toBe('MEALY')
    for (const w of allWords(['0', '1'], 6)) {
      expect(translate(mealy, w), w).toBe(expectedMod3(w).slice(1))
    }
  })

  it('hin und zurück bleibt die Übersetzung gleich', () => {
    const back = mooreToMealy(mealyToMoore(edges))
    for (const w of allWords(['0', '1'], 5)) expect(translate(back, w), w).toBe(expectedEdges(w))
  })
})

describe('Typwechsel mit Transduktoren', () => {
  const dfa = buildDocument('NFA', ['a', 'b'], { start: 'q0', finals: ['q1'] }, [
    ['q0', 'a,ε', 'q1'],
    ['q1', 'b', 'q0']
  ])

  it('Akzeptor → Mealy: Regeln geben ε aus, ε-Regeln und Endzustände entfallen, Δ entsteht', () => {
    const mealy = changeDocumentType(dfa, 'MEALY')
    expect(mealy.output).toEqual({ alphabet: [] })
    expect(mealy.graph.states.some((s) => s.isFinal)).toBe(false)
    expect(mealy.graph.transitions.map((t) => t.labels)).toEqual([
      [{ read: 'a', output: [] }],
      [{ read: 'b', output: [] }]
    ])
  })

  it('Akzeptor → Moore: Zustände geben ε aus', () => {
    const moore = changeDocumentType(dfa, 'MOORE')
    expect(moore.graph.states.map((s) => s.output)).toEqual([[], []])
    expect(moore.graph.transitions.map((t) => t.labels)).toEqual([[{ read: 'a' }], [{ read: 'b' }]])
  })

  it('Transduktor → Kellerautomat: Ausgaben und Δ entfallen', () => {
    const pda = changeDocumentType(edges, 'NPDA')
    expect(pda.output).toBeUndefined()
    expect(pda.stack).toBeDefined()
    expect(pda.graph.transitions[0].labels).toEqual([{ read: '0', pop: '#', push: ['#'] }])
  })

  it('Moore → DEA: Zustandsausgaben entfallen', () => {
    const doc = changeDocumentType(mod3, 'DFA')
    expect(doc.graph.states.every((s) => s.output === undefined)).toBe(true)
    expect(doc.output).toBeUndefined()
  })
})

describe('Beschriftung und Text', () => {
  it('Mealy-Regeln „a/0, b/11“ – auch kurz „a 0“, ohne Ausgabe ε', () => {
    const doc = buildDocument('MEALY', ['a', 'b'], { output: ['0', '1'] }, [])
    expect(parseLabels('a/0, b → 11; a 1, b', doc)).toEqual({
      labels: [
        { read: 'a', output: ['0'] },
        { read: 'b', output: ['1', '1'] },
        { read: 'a', output: ['1'] },
        { read: 'b', output: [] }
      ]
    })
    expect(formatLabelsInline([{ read: 'a', output: ['0'] }, { read: 'b', output: [] }])).toBe(
      'a/0, b/ε'
    )
    expect(parseLabels('/0', doc)).toEqual({ error: '„/0“ ist keine Mealy-Regel (a/0)' })
  })

  it('Moore-Zustand als „q0/1“', () => {
    expect(stateText(mod3.graph.states[0], mod3)).toBe('r0/0')
    expect(stateText(edges.graph.states[0], edges)).toBe('s')
  })

  it('Beschreibung nennt die Ausgabe, das Ergebnis die Übersetzung', () => {
    const sim = new TransducerSimulator(mod3, '1')
    const steps = [sim.reset(), ...sim.run().steps]
    expect(describeStep(mod3, steps[0])).toBe('Start in Zustand r0, dabei wird „0“ ausgegeben.')
    expect(describeStep(mod3, steps[1], steps[0])).toBe(
      'Es wird „1“ gelesen, „1“ ausgegeben und in Zustand r1 gewechselt.'
    )
    expect(describeOutcome('1', true, null, '01')).toBe('Das Wort „1“ wird in „01“ übersetzt.')
    expect(describeOutcome('1b', false, 'Kein Übergang von r1 mit „b“', '01')).toBe(
      'Kein Übergang von r1 mit „b“, Ausgabe bis dahin „01“.'
    )
  })
})

describe('Datei', () => {
  it('Mealy und Moore überstehen Speichern und Laden', () => {
    for (const doc of [edges, mod3]) {
      expect(deserializeDocument(serializeDocument(doc))).toEqual(doc)
    }
  })

  it('ungültiges Ausgabealphabet wird abgelehnt', () => {
    const text = serializeDocument({ ...edges, output: { alphabet: ['0', '0'] } })
    expect(() => deserializeDocument(text)).toThrow('„0“ doppelt in Δ')
  })
})

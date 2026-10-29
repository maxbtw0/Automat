import { describe, expect, it } from 'vitest'
import type { AutomatonDocument } from '@/model/graph'
import { describeOutcome, describeStep } from './describe'
import { createAutomaton } from './registry'
import { buildDocument } from './testing'

/** Alle Beschreibungen eines Laufs */
function descriptions(document: AutomatonDocument, word: string): string[] {
  const simulator = createAutomaton(document).createSimulator(word)
  const steps = [simulator.reset(), ...simulator.run().steps]
  return steps.map((step, i) => describeStep(document, step, steps[i - 1]))
}

describe('describeStep', () => {
  it('DEA: Lesen, Wechsel, Endzustand, Zustand beibehalten', () => {
    const doc = buildDocument('DFA', ['a', 'b'], { start: 'q0', finals: ['q2'] }, [
      ['q0', 'a', 'q1'],
      ['q1', 'b', 'q2'],
      ['q2', 'b', 'q2']
    ])
    expect(descriptions(doc, 'abb')).toEqual([
      'Start in Zustand q0.',
      'Es wird „a“ gelesen und in Zustand q1 gewechselt.',
      'Es wird „b“ gelesen und in den Endzustand (q2) gewechselt.',
      'Es wird „b“ gelesen und der Endzustand (q2) beibehalten.'
    ])
  })

  it('DEA hängt: kein Übergang', () => {
    const doc = buildDocument('DFA', ['a', 'b'], { start: 'q0' }, [['q0', 'a', 'q0']])
    expect(descriptions(doc, 'b').at(-1)).toBe('Es gibt keinen Übergang mit „b“.')
  })

  it('NEA: mehrere Zustände, Endzustand markiert', () => {
    const doc = buildDocument('NFA', ['a'], { start: 'q0', finals: ['q2'] }, [
      ['q0', 'a', 'q1'],
      ['q0', 'a', 'q2'],
      ['q1', 'a', 'q2']
    ])
    // Nach „a“ führen q1 und q2 weiter (q2 akzeptiert sofort, q1 nach einem weiteren a)
    const simulator = createAutomaton(doc).createSimulator('a')
    const steps = [simulator.reset(), ...simulator.run().steps]
    const step = { ...steps[1], activeStateIds: ['q1', 'q2'] }
    expect(describeStep(doc, step, steps[0])).toBe(
      'Es wird „a“ gelesen und in die Zustände q1 und q2 (Endzustand) gewechselt.'
    )
  })

  it('Kellerautomat: Stack nehmen und legen, ε-Schritt', () => {
    const doc = buildDocument('NPDA', ['a', 'b'], { start: 'q0', finals: ['q2'], stack: ['A', '#'] }, [
      ['q0', 'a, # → A#; a, A → AA', 'q0'],
      ['q0', 'b, A → ε', 'q1'],
      ['q1', 'b, A → ε', 'q1'],
      ['q1', 'ε, # → #', 'q2']
    ])
    expect(descriptions(doc, 'aabb')).toEqual([
      'Start in Zustand q0, auf dem Stack liegt „#“.',
      'Es wird „a“ gelesen, „#“ vom Stack genommen, „A#“ auf den Stack gelegt und der Zustand q0 beibehalten.',
      'Es wird „a“ gelesen, „A“ vom Stack genommen, „AA“ auf den Stack gelegt und der Zustand q0 beibehalten.',
      'Es wird „b“ gelesen, „A“ vom Stack genommen und in Zustand q1 gewechselt.',
      'Es wird „b“ gelesen, „A“ vom Stack genommen und der Zustand q1 beibehalten.',
      'Es wird nichts gelesen, „#“ vom Stack genommen, „#“ auf den Stack gelegt und in den Endzustand (q2) gewechselt.'
    ])
  })

  it('Kellerautomat mit leerem Stack: kein „Endzustand“', () => {
    const doc = buildDocument('NPDA', ['a'], { start: 'q0', finals: ['q1'], acceptance: 'empty' }, [
      ['q0', 'a, # → ε', 'q1']
    ])
    expect(descriptions(doc, 'a')[1]).toBe(
      'Es wird „a“ gelesen, „#“ vom Stack genommen und in Zustand q1 gewechselt.'
    )
  })

  it('Turingmaschine: Lesen, Schreiben, Zustand, Kopf', () => {
    const doc = buildDocument('TM', ['a'], { start: 'q0', finals: ['q2'], tape: ['X'] }, [
      ['q0', 'a → X, R', 'q1'],
      ['q1', '# → #, L', 'q1'],
      ['q1', 'X → a, N', 'q2']
    ])
    expect(descriptions(doc, 'a')).toEqual([
      'Start in Zustand q0.',
      'Es wird „a“ gelesen, „X“ geschrieben, in Zustand q1 gewechselt und der Kopf nach rechts bewegt.',
      'Es wird „#“ gelesen, „#“ geschrieben, der Zustand q1 beibehalten und der Kopf nach links bewegt.',
      'Es wird „X“ gelesen, „a“ geschrieben, in den Endzustand (q2) gewechselt und der Kopf nicht bewegt.'
    ])
  })
})

describe('describeOutcome', () => {
  it('akzeptiert, verworfen, abgebrochen', () => {
    expect(describeOutcome('ab', true)).toBe('Das Wort „ab“ wird akzeptiert.')
    expect(describeOutcome('', false)).toBe('Das Wort „ε“ wird verworfen.')
    expect(describeOutcome('a', false, 'Abbruch nach 10.000 Schritten')).toBe(
      'Abbruch nach 10.000 Schritten.'
    )
  })
})

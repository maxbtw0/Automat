import { describe, expect, it } from 'vitest'
import { AUTOMATON_TYPES } from '@/model/graph'
import { createAutomaton } from './registry'
import { buildDocument } from './testing'

describe('Prüfung: Übergänge zu fehlenden Zuständen', () => {
  const labelFor = {
    DFA: 'a',
    NFA: 'a',
    DPDA: 'a, # → #',
    NPDA: 'a, # → #',
    TM: 'a → a, R',
    MEALY: 'a/',
    MOORE: 'a'
  }

  it.each(AUTOMATON_TYPES)('%s meldet fehlendes Ziel und fehlende Quelle als Fehler', (type) => {
    const doc = buildDocument(type, ['a'], { start: 'q0', finals: ['q0'] }, [
      ['q0', labelFor[type], 'q0']
    ])
    const [loop] = doc.graph.transitions
    doc.graph.transitions.push(
      { ...loop, id: 'zu', to: 'fehlt' },
      { ...loop, id: 'von', from: 'weg', to: 'q0' }
    )
    const errors = createAutomaton(doc)
      .validate()
      .filter((i) => i.severity === 'error')
    expect(errors.filter((i) => i.message.includes('fehlendem'))).toEqual([
      { severity: 'error', message: 'Übergang zu fehlendem Zustand „fehlt“', transitionIds: ['zu'] },
      { severity: 'error', message: 'Übergang von fehlendem Zustand „weg“', transitionIds: ['von'] }
    ])
  })

  it('ein vollständiger Graph meldet nichts dazu', () => {
    const doc = buildDocument('DFA', ['a'], { start: 'q0', finals: ['q0'] }, [['q0', 'a', 'q0']])
    expect(createAutomaton(doc).validate().filter((i) => i.severity === 'error')).toEqual([])
  })
})

import { describe, expect, it } from 'vitest'
import { createAutomaton } from '@/core/automaton/registry'
import { AUTOMATON_TYPES } from '@/model/graph'
import { deserializeDocument } from '@/model/serialization'
import { EXAMPLE_FILE } from './helpExample'
import { HELP_GROUPS, helpTabKey, initialHelpTab } from './helpTabs'

describe('Hilfe-Reiter', () => {
  const tabs = HELP_GROUPS.flatMap((g) => g.tabs)

  it('hat einen Reiter pro Automatentyp, dazu Speichern und Tooltips', () => {
    expect(tabs.filter((t) => t.kind === 'type').map((t) => t.type)).toEqual([...AUTOMATON_TYPES])
    expect(tabs.map((t) => t.kind)).toContain('saving')
    expect(tabs.map((t) => t.kind)).toContain('tooltips')
  })

  it('hat eindeutige Schlüssel', () => {
    const keys = tabs.map(helpTabKey)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('geht beim aktuellen Automatentyp auf', () => {
    expect(initialHelpTab('NPDA')).toEqual({ kind: 'type', type: 'NPDA' })
  })
})

describe('Beispieldatei der Hilfe', () => {
  const automaton = createAutomaton(deserializeDocument(EXAMPLE_FILE))

  it('lässt sich öffnen und ist ein fehlerfreier DEA', () => {
    expect(automaton.validate().filter((issue) => issue.severity === 'error')).toEqual([])
  })

  it('akzeptiert genau die Wörter mit gerader Anzahl a', () => {
    for (const word of ['', 'b', 'aa', 'abab', 'bbaab']) expect(automaton.accepts(word)).toBe(true)
    for (const word of ['a', 'ab', 'aaa', 'babbb']) expect(automaton.accepts(word)).toBe(false)
  })
})

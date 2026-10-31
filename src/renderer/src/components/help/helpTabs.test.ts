import { describe, expect, it } from 'vitest'
import { createAutomaton } from '@/core/automaton/registry'
import { AUTOMATON_TYPES } from '@/model/graph'
import { deserializeDocument } from '@/model/serialization'
import { version } from '../../../../../package.json'
import { EXAMPLE_FILE } from './helpExample'
import { HELP_GROUPS, helpTabKey, initialHelpTab } from './helpTabs'
import { CHANGELOG, PROGRAM, formatChangelogDate } from './programInfo'

describe('Hilfe-Reiter', () => {
  const tabs = HELP_GROUPS.flatMap((g) => g.tabs)

  it('hat einen Reiter pro Automatentyp, dazu Speichern, Tooltips und Programm', () => {
    expect(tabs.filter((t) => t.kind === 'type').map((t) => t.type)).toEqual([...AUTOMATON_TYPES])
    expect(tabs.map((t) => t.kind)).toContain('saving')
    expect(tabs.map((t) => t.kind)).toContain('tooltips')
    expect(tabs.map((t) => t.kind)).toContain('program')
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

describe('Programm-Reiter', () => {
  it('zeigt die Version aus package.json', () => {
    expect(PROGRAM.version).toBe(version)
  })

  it('beginnt den Changelog mit der aktuellen Version', () => {
    expect(CHANGELOG[0].version).toBe(version)
  })

  it('hat jede Version nur einmal, neueste zuerst', () => {
    const versions = CHANGELOG.map((entry) => entry.version)
    expect(new Set(versions).size).toBe(versions.length)
    const dates = CHANGELOG.map((entry) => entry.date)
    expect([...dates].sort().reverse()).toEqual(dates)
  })

  it('schreibt das Datum deutsch', () => {
    expect(formatChangelogDate('2026-10-31')).toBe('31.10.2026')
  })
})

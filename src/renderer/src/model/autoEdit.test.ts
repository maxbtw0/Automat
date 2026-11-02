import { describe, expect, it } from 'vitest'
import abStarA from '../../../../beispiele/autoedit/ab-stern-a-dea.xml?raw'
import epsilonNfa from '../../../../beispiele/autoedit/epsilon-nea.xml?raw'
import { createAutomaton } from '@/core/automaton/registry'
import { allWords } from '@/core/automaton/testing'
import { STATE_RADIUS } from '@/utils/geometry'
import { parseXml } from '@/utils/xml'
import { importAutoEdit, looksLikeXml } from './autoEdit'
import { EPSILON } from './graph'

const R = STATE_RADIUS

describe('parseXml', () => {
  it('liest Elemente, Attribute und Entitäten, überspringt Text und Kommentare', () => {
    const root = parseXml(
      '<?xml version="1.0"?><!-- x --><A k="1 &amp; 2"><B v=\'&#x3b5;\'/>Text<C></C></A>'
    )
    expect(root).toEqual({
      name: 'A',
      attributes: { k: '1 & 2' },
      children: [
        { name: 'B', attributes: { v: 'ε' }, children: [] },
        { name: 'C', attributes: {}, children: [] }
      ]
    })
  })

  it('meldet falsch verschachtelte Elemente', () => {
    expect(() => parseXml('<A><B></A>')).toThrow('Unerwartetes </A>')
    expect(() => parseXml('<A>')).toThrow('<A> nicht geschlossen')
  })
})

describe('importAutoEdit', () => {
  it('liest den DEA für ab*a mit Layout', () => {
    const doc = importAutoEdit(abStarA)
    expect(doc.type).toBe('DFA')
    expect(doc.alphabet).toEqual(['a', 'b'])

    const states = doc.graph.states.map(({ label, x, y, isStart, isFinal }) => ({
      label,
      x,
      y,
      isStart,
      isFinal
    }))
    expect(states).toEqual([
      { label: 'q0', x: 175 + R, y: 155 + R, isStart: true, isFinal: false },
      { label: 'q1', x: 459 + R, y: 175 + R, isStart: false, isFinal: false },
      { label: 'q2', x: 225 + R, y: 286 + R, isStart: false, isFinal: true },
      { label: 'trap', x: 400 + R, y: 334 + R, isStart: false, isFinal: false }
    ])

    const name = (id: string): string | undefined =>
      doc.graph.states.find((s) => s.id === id)?.label
    const edges = doc.graph.transitions.map((t) => [
      name(t.from),
      t.labels.map((l) => l.read).join(','),
      name(t.to)
    ])
    expect(edges).toEqual([
      ['q0', 'a', 'q1'],
      ['q0', 'b', 'trap'],
      ['q1', 'b', 'q1'],
      ['q1', 'a', 'q2'],
      ['q2', 'a,b', 'trap'],
      ['trap', 'a,b', 'trap']
    ])

    const automaton = createAutomaton(doc)
    expect(automaton.validate()).toEqual([])
    const accepted = allWords(['a', 'b'], 6).filter((w) => automaton.accepts(w))
    expect(accepted).toEqual(allWords(['a', 'b'], 6).filter((w) => /^ab*a$/.test(w)))
  })

  it('liest den NEA mit ε-Übergang', () => {
    const doc = importAutoEdit(epsilonNfa)
    expect(doc.type).toBe('NFA')
    expect(doc.graph.states.map((s) => [s.label, s.isStart, s.isFinal])).toEqual([
      ['q0', true, true],
      ['q1', false, true]
    ])
    expect(doc.graph.transitions.map((t) => t.labels)).toEqual([[{ read: EPSILON }]])
    expect(createAutomaton(doc).accepts('')).toBe(true)
  })

  it('legt mehrfach genannte Ziele zu einem Übergang zusammen', () => {
    const doc = importAutoEdit(`
      <AUTOMATON><TYPE value="NEA"/><ALPHABET><ITEM value="a"/><ITEM value="b"/></ALPHABET>
        <STATE name="z" finalstate="true">
          <TRANSITION target="z"><LABEL read="a"/></TRANSITION>
          <TRANSITION target="z"><LABEL read="b"/><LABEL read="a"/></TRANSITION>
        </STATE>
        <INITIALSTATE value="z"/>
      </AUTOMATON>`)
    expect(doc.graph.transitions).toHaveLength(1)
    expect(doc.graph.transitions[0].labels).toEqual([{ read: 'a' }, { read: 'b' }])
  })

  it('ordnet ohne Layout selbst an und behält Namen, die ohne „_“ gleich würden', () => {
    const doc = importAutoEdit(`
      <AUTOMATON><TYPE value="DEA"/><ALPHABET><ITEM value="a"/></ALPHABET>
        <STATE name="q_1" finalstate="false"><TRANSITION target="q1"><LABEL read="a"/></TRANSITION></STATE>
        <STATE name="q1" finalstate="true"/>
        <INITIALSTATE value="q_1"/>
      </AUTOMATON>`)
    const [first, second] = doc.graph.states
    expect([first.label, second.label]).toEqual(['q_1', 'q1'])
    expect(second.x).toBeGreaterThan(first.x)
  })

  it('meldet unbekannte Typen und kaputte Dateien', () => {
    expect(() => importAutoEdit('<AUTOMATON><TYPE value="TM"/></AUTOMATON>')).toThrow(
      'AutoEdit-Typ „TM“ wird nicht unterstützt.'
    )
    expect(() => importAutoEdit('<FOO/>')).toThrow('Das ist keine AutoEdit-Datei.')
    expect(() => importAutoEdit('<AUTOMATON>')).toThrow('kein gültiges XML')
    expect(() =>
      importAutoEdit(
        '<AUTOMATON><TYPE value="DEA"/><STATE name="a"><TRANSITION target="b"/></STATE></AUTOMATON>'
      )
    ).toThrow('Übergang zu unbekanntem Zustand „b“')
  })

  it('erkennt XML am Anfang der Datei', () => {
    expect(looksLikeXml('﻿  <?xml version="1.0"?>')).toBe(true)
    expect(looksLikeXml('{"format":"automat"}')).toBe(false)
  })
})

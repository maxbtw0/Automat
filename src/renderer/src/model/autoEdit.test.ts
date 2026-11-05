import { describe, expect, it } from 'vitest'
import abStarA from '../../../../beispiele/autoedit/ab-stern-a-dea.xml?raw'
import epsilonNfa from '../../../../beispiele/autoedit/epsilon-nea.xml?raw'
import atoccNfa from '../../../../beispiele/autoedit/atocc-1_2_1_1-nea.xml?raw'
import atoccDfa from '../../../../beispiele/autoedit/atocc-1_2_1_2-dea.xml?raw'
import atoccSentence from '../../../../beispiele/autoedit/atocc-1_2_2_1-nea.xml?raw'
import atoccDpda from '../../../../beispiele/autoedit/atocc-2_1_1_1-dka.xml?raw'
import atoccNpdaPalindromes from '../../../../beispiele/autoedit/atocc-2_2_1_1-nka.xml?raw'
import atoccNpdaEqual from '../../../../beispiele/autoedit/atocc-2_2_1_2-nka.xml?raw'
import atoccNpdaAnBn from '../../../../beispiele/autoedit/atocc-2_2_1_3-nka.xml?raw'
import atoccParity from '../../../../beispiele/autoedit/atocc-3_1_1_1-tm.xml?raw'
import atoccAnBnCn from '../../../../beispiele/autoedit/atocc-3_1_1_2-tm.xml?raw'
import atoccEqual from '../../../../beispiele/autoedit/atocc-3_1_1_3-tm.xml?raw'
import { createAutomaton } from '@/core/automaton/registry'
import { allWords } from '@/core/automaton/testing'
import { TuringSimulator } from '@/core/automaton/tmSimulator'
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
    // q_0 und q_2 stehen nur 140 auseinander → gestreckt auf 150, q_0 (links oben) bleibt
    const factor = 150 / Math.hypot(225 - 175, 286 - 155)
    const at = (left: number, top: number) => ({
      x: 175 + R + (left - 175) * factor,
      y: 155 + R + (top - 155) * factor
    })
    expect(states).toEqual([
      { label: 'q0', ...at(175, 155), isStart: true, isFinal: false },
      { label: 'q1', ...at(459, 175), isStart: false, isFinal: false },
      { label: 'q2', ...at(225, 286), isStart: false, isFinal: true },
      { label: 'trap', ...at(400, 334), isStart: false, isFinal: false }
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

  it('trennt Zustände, die im Layout genau übereinander liegen', () => {
    const state = (name: string, left: number) =>
      `<STATELAYOUT name="${name}"><LEFT value="${left}"/><TOP value="0"/></STATELAYOUT>`
    const doc = importAutoEdit(`
      <AUTOMATON><TYPE value="DEA"/><ALPHABET><ITEM value="a"/></ALPHABET>
        <STATE name="q0" finalstate="false"/><STATE name="q1" finalstate="false"/>
        <STATE name="q2" finalstate="true"/><INITIALSTATE value="q0"/>
        <LAYOUT>${state('q0', 0)}${state('q1', 0)}${state('q2', 40)}</LAYOUT>
      </AUTOMATON>`)
    const points = doc.graph.states
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const d = Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y)
        expect(d, `${points[i].label}–${points[j].label}`).toBeGreaterThanOrEqual(150)
      }
    }
    expect(points[0]).toMatchObject({ x: R, y: R })
  })

  it('trennt auch Zustände an riesigen Koordinaten', () => {
    const state = (name: string, left: string) =>
      `<STATELAYOUT name="${name}"><LEFT value="${left}"/><TOP value="0"/></STATELAYOUT>`
    const doc = importAutoEdit(`
      <AUTOMATON><TYPE value="DEA"/><ALPHABET><ITEM value="a"/></ALPHABET>
        <STATE name="q0" finalstate="false"/><STATE name="q1" finalstate="true"/>
        <STATE name="q2" finalstate="true"/><INITIALSTATE value="q0"/>
        <LAYOUT>${state('q0', '0')}${state('q1', '1e20')}${state('q2', '1e20')}</LAYOUT>
      </AUTOMATON>`)
    const [, q1, q2] = doc.graph.states
    expect(Math.abs(q1.x - q2.x)).toBeGreaterThanOrEqual(150)
    expect(Math.max(...doc.graph.states.map((s) => Math.abs(s.x)))).toBeLessThan(1e7)
  })

  it('streckt dichte Layouts nicht ins Unendliche', () => {
    const state = (name: string, left: string) =>
      `<STATELAYOUT name="${name}"><LEFT value="${left}"/><TOP value="0"/></STATELAYOUT>`
    const doc = importAutoEdit(`
      <AUTOMATON><TYPE value="DEA"/><ALPHABET><ITEM value="a"/></ALPHABET>
        <STATE name="q0" finalstate="false"/><STATE name="q1" finalstate="false"/>
        <STATE name="q2" finalstate="false"/><STATE name="q3" finalstate="true"/>
        <INITIALSTATE value="q0"/>
        <LAYOUT>${state('q0', '0')}${state('q1', '1e-300')}${state('q2', '1e6')}${state('q3', '1e6')}</LAYOUT>
      </AUTOMATON>`)
    const [, , q2, q3] = doc.graph.states
    expect(Math.abs(q2.x - q3.x)).toBeGreaterThanOrEqual(150)
    expect(Math.max(...doc.graph.states.map((s) => Math.abs(s.x)))).toBeLessThan(1e7)
  })

  it('meldet unbekannte Typen und kaputte Dateien', () => {
    expect(() => importAutoEdit('<AUTOMATON><TYPE value="MOORE"/></AUTOMATON>')).toThrow(
      'AutoEdit-Typ „MOORE“ wird nicht unterstützt.'
    )
    expect(() =>
      importAutoEdit(`<AUTOMATON><TYPE value="TM"/><STATE name="q">
        <TRANSITION target="q"><LABEL read="a" write="a" direction="UP"/></TRANSITION>
      </STATE></AUTOMATON>`)
    ).toThrow('Richtung „UP“ unbekannt')
    expect(() => importAutoEdit('<FOO/>')).toThrow('Das ist keine AutoEdit-Datei.')
    expect(() => importAutoEdit('<AUTOMATON>')).toThrow('kein gültiges XML')
    expect(() =>
      importAutoEdit(
        '<AUTOMATON><TYPE value="DEA"/><STATE name="a"><TRANSITION target="b"/></STATE></AUTOMATON>'
      )
    ).toThrow('Übergang zu unbekanntem Zustand „b“')
  })

  it('liest die Lösungen von atocc.de für DEA und NEA', () => {
    const contains = (w: string) => w.includes('aba')
    for (const text of [atoccNfa, atoccDfa]) {
      const automaton = createAutomaton(importAutoEdit(text))
      expect(automaton.validate()).toEqual([])
      for (const w of allWords(['a', 'b'], 7)) expect(automaton.accepts(w), w).toBe(contains(w))
    }

    // Mehrzeichen-Symbole und ε neben einem Symbol am selben Übergang
    const sentence = createAutomaton(importAutoEdit(atoccSentence))
    expect(sentence.validate()).toEqual([])
    expect(sentence.accepts('Artikel Adjektiv Substantiv Verb')).toBe(true)
    expect(sentence.accepts('Artikel Substantiv Verb Adverb')).toBe(true)
    expect(sentence.accepts('Artikel Verb')).toBe(false)
  })
})

describe('importAutoEdit – Kellerautomat', () => {
  const isAnBn = (w: string) => /^(a+)(b+)$/.test(w) && w.length === 2 * w.indexOf('b')
  const count = (w: string, c: string) => w.split(c).length - 1

  it('liest Γ, Startsymbol und Regeln mit Push-Wort', () => {
    const doc = importAutoEdit(atoccDpda)
    expect(doc.type).toBe('DPDA')
    expect(doc.stack).toEqual({ alphabet: ['$', 'A'], start: '$', acceptance: 'final' })
    const rules = doc.graph.transitions.flatMap((t) => t.labels)
    expect(rules).toContainEqual({ read: 'a', pop: '$', push: ['A', '$'] })
    expect(rules).toContainEqual({ read: EPSILON, pop: '$', push: [] })
  })

  it('liest „eps“ als Push-Wort aus Γ, „EPSILON“ als leeres Wort', () => {
    const doc = importAutoEdit(`
      <AUTOMATON><TYPE value="DKA"/><ALPHABET><ITEM value="a"/><ITEM value="b"/></ALPHABET>
        <STACKALPHABET><ITEM value="$"/><ITEM value="e"/><ITEM value="p"/><ITEM value="s"/></STACKALPHABET>
        <STATE name="q0" finalstate="false"><TRANSITION target="q1">
          <LABEL read="a" topofstack="$" write="eps"/></TRANSITION></STATE>
        <STATE name="q1" finalstate="false"><TRANSITION target="q2">
          <LABEL read="b" topofstack="e" write="EPSILON"/></TRANSITION></STATE>
        <STATE name="q2" finalstate="true"/>
        <INITIALSTATE value="q0"/><STACKINITIALCHAR value="$"/>
      </AUTOMATON>`)
    const rules = doc.graph.transitions.flatMap((t) => t.labels)
    expect(rules).toEqual([
      { read: 'a', pop: '$', push: ['e', 'p', 's'] },
      { read: 'b', pop: 'e', push: [] }
    ])
    const automaton = createAutomaton(doc)
    expect(automaton.validate()).toEqual([])
    expect(automaton.accepts('ab')).toBe(true)
  })

  it('liest „eps“ als leeres Wort, wenn Γ die Buchstaben nicht hat', () => {
    const doc = importAutoEdit(`
      <AUTOMATON><TYPE value="DKA"/><ALPHABET><ITEM value="a"/></ALPHABET>
        <STACKALPHABET><ITEM value="$"/></STACKALPHABET>
        <STATE name="q0" finalstate="true"><TRANSITION target="q0">
          <LABEL read="a" topofstack="$" write="eps"/></TRANSITION></STATE>
        <INITIALSTATE value="q0"/><STACKINITIALCHAR value="$"/>
      </AUTOMATON>`)
    expect(doc.graph.transitions[0].labels).toEqual([{ read: 'a', pop: '$', push: [] }])
  })

  it('erkennt mit den Lösungen dieselben Sprachen wie die Aufgaben', () => {
    const cases: [string, (w: string) => boolean][] = [
      [atoccDpda, isAnBn],
      [atoccNpdaAnBn, isAnBn],
      [atoccNpdaPalindromes, (w) => w === [...w].reverse().join('')],
      [atoccNpdaEqual, (w) => count(w, 'a') === count(w, 'b')]
    ]
    for (const [text, inLanguage] of cases) {
      const automaton = createAutomaton(importAutoEdit(text))
      expect(automaton.validate()).toEqual([])
      for (const w of allWords(['a', 'b'], 6)) expect(automaton.accepts(w), w).toBe(inLanguage(w))
    }
  })

  it('übernimmt einen eigenen Radius aus dem Layout', () => {
    const [start] = importAutoEdit(atoccNpdaPalindromes).graph.states
    expect([start.label, start.x, start.y]).toEqual(['Start', 200, 150])
  })
})

describe('importAutoEdit – Turingmaschine', () => {
  it('liest Γ mit dem Blank am Ende und die Bewegungen', () => {
    const doc = importAutoEdit(atoccParity)
    expect(doc.type).toBe('TM')
    expect(doc.tape).toEqual({ alphabet: ['0', '1', '$'], blank: '$' })
    const rules = doc.graph.transitions.flatMap((t) => t.labels)
    expect(rules).toContainEqual({ read: '1', write: '1', move: 'R' })
    expect(rules).toContainEqual({ read: '$', write: '0', move: 'N' })
  })

  it('hängt das Paritätsbit an', () => {
    const doc = importAutoEdit(atoccParity)
    expect(createAutomaton(doc).validate()).toEqual([])
    for (const w of allWords(['0', '1'], 5)) {
      const sim = new TuringSimulator(doc, w)
      expect(sim.run().accepted, w).toBe(true)
      expect(sim.output.join(''), w).toBe(w + ((w.split('1').length - 1) % 2))
    }
  })

  it('behält ohne TAPEINITIALCHAR das deklarierte Γ und wählt ein freies Blank', () => {
    const doc = importAutoEdit(atoccAnBnCn.replace(/<TAPEINITIALCHAR[^>]*\/>/, ''))
    const tape = doc.tape!
    expect(tape.alphabet).toEqual(expect.arrayContaining(['X', '-', '$', 'a', 'b', 'c']))
    expect(tape.alphabet.at(-1)).toBe(tape.blank)
    expect(['X', '-', '$', 'a', 'b', 'c']).not.toContain(tape.blank)
    expect(createAutomaton(doc).validate()).toEqual([])
  })

  it('erkennt aⁿbⁿcⁿ', () => {
    const automaton = createAutomaton(importAutoEdit(atoccAnBnCn))
    expect(automaton.validate()).toEqual([])
    const isAnBnCn = (w: string) => {
      const n = w.length / 3
      return w === 'a'.repeat(n) + 'b'.repeat(n) + 'c'.repeat(n)
    }
    for (const w of allWords(['a', 'b', 'c'], 6)) {
      expect(automaton.accepts(w), w).toBe(isAnBnCn(w))
    }
  })

  it('vergleicht x=y und behält „q0“ neben „q_0“', () => {
    const doc = importAutoEdit(atoccEqual)
    expect(doc.graph.states.map((s) => s.label)).toContain('q_0')
    const automaton = createAutomaton(doc)
    expect(automaton.validate()).toEqual([])
    for (const w of allWords(['0', '1', '='], 5)) {
      expect(automaton.accepts(w), w).toBe(/^([01]+)=\1$/.test(w))
    }
  })
})

describe('looksLikeXml', () => {
  it('erkennt XML am Anfang der Datei', () => {
    expect(looksLikeXml('﻿  <?xml version="1.0"?>')).toBe(true)
    expect(looksLikeXml('{"format":"automat"}')).toBe(false)
  })
})

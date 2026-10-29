import { describe, expect, it } from 'vitest'
import { createEmptyDocument } from './graph'
import { deserializeDocument, serializeDocument } from './serialization'

describe('serialization', () => {
  it('liest ein gespeichertes Dokument unverändert wieder ein', () => {
    const doc = createEmptyDocument()
    doc.alphabet = ['a', 'b']
    doc.graph.states.push({ id: 's1', label: 'q0', x: 10, y: 20, isStart: true, isFinal: false })
    doc.graph.transitions.push({ id: 't1', from: 's1', to: 's1', labels: [{ read: 'a' }] })

    expect(deserializeDocument(serializeDocument(doc))).toEqual(doc)
  })

  it('liest einen Kellerautomaten mit Γ und Stackregeln wieder ein', () => {
    const doc = createEmptyDocument('NPDA')
    doc.alphabet = ['a']
    doc.graph.states.push({ id: 's1', label: 'q0', x: 0, y: 0, isStart: true, isFinal: true })
    doc.graph.transitions.push({
      id: 't1',
      from: 's1',
      to: 's1',
      labels: [{ read: 'a', pop: '#', push: ['A', '#'] }]
    })

    const loaded = deserializeDocument(serializeDocument(doc))
    expect(loaded).toEqual(doc)
    expect(loaded.stack).toEqual({ alphabet: ['#'], start: '#', acceptance: 'final' })
  })

  it('lädt alte Dateien mit Feld „name“ und verwirft den Namen', () => {
    const old = { format: 'automat', version: 1, document: { ...createEmptyDocument(), name: 'Alt' } }
    expect(deserializeDocument(JSON.stringify(old))).toEqual(createEmptyDocument())
  })

  it('wandelt Symbole aus Version 1 in Regeln um', () => {
    const v1 = createEmptyDocument() as unknown as { graph: { transitions: unknown[] } }
    v1.graph.transitions.push({ id: 't1', from: 's1', to: 's1', symbols: ['a', 'b'] })
    const old = { format: 'automat', version: 1, document: v1 }

    expect(deserializeDocument(JSON.stringify(old)).graph.transitions).toEqual([
      { id: 't1', from: 's1', to: 's1', labels: [{ read: 'a' }, { read: 'b' }] }
    ])
  })

  it('lehnt fremde Dateien ab', () => {
    expect(() => deserializeDocument('{"foo": 1}')).toThrow()
    expect(() => deserializeDocument('kein json')).toThrow()
  })
})

describe('serialization: beschädigte Dateien', () => {
  const file = (document: Record<string, unknown>, version = 2): string => {
    const base = { type: 'DFA', alphabet: ['a'], graph: { states: [], transitions: [] } }
    return JSON.stringify({ format: 'automat', version, document: { ...base, ...document } })
  }
  const state = { id: 's1', label: 'q0', x: 0, y: 0, isStart: true, isFinal: false }
  const graph = (states: unknown[], transitions: unknown[] = []) => ({ graph: { states, transitions } })

  it('lehnt kaputte Zustände ab', () => {
    expect(() => deserializeDocument(file(graph([null])))).toThrow('Zustand Nr. 1 ungültig')
    expect(() => deserializeDocument(file(graph([{ ...state, x: '0' }])))).toThrow('ungültig')
    expect(() => deserializeDocument(file(graph([{ ...state, isFinal: 1 }])))).toThrow('ungültig')
    const { label: _label, ...noLabel } = state
    expect(() => deserializeDocument(file(graph([state, noLabel])))).toThrow('Zustand Nr. 2')
    expect(() => deserializeDocument(file(graph([state, state])))).toThrow('„s1“ doppelt')
  })

  it('lehnt kaputte Übergänge und Regeln ab', () => {
    const t = { id: 't1', from: 's1', to: 's1', labels: [{ read: 'a' }] }
    const load = (transition: unknown) => () => deserializeDocument(file(graph([state], [transition])))
    expect(load(null)).toThrow('Übergang Nr. 1 ungültig')
    expect(load({ ...t, to: 7 })).toThrow('ungültig')
    expect(load({ ...t, labels: 'a' })).toThrow('ungültig')
    expect(load({ ...t, labels: [null] })).toThrow('ungültig')
    expect(load({ ...t, labels: [{ read: 'a', push: 'A' }] })).toThrow('ungültig')
    expect(load({ ...t, labels: [{ read: 'a', move: 'X' }] })).toThrow('ungültig')
  })

  it('lehnt leere, doppelte und falsch typisierte Alphabetsymbole ab', () => {
    expect(() => deserializeDocument(file({ alphabet: [''] }))).toThrow('Leeres Symbol in Σ')
    expect(() => deserializeDocument(file({ alphabet: ['a', 'a'] }))).toThrow('„a“ doppelt in Σ')
    expect(() => deserializeDocument(file({ alphabet: [1] }))).toThrow('Σ ungültig')
    const stack = { alphabet: ['', '#'], start: '#', acceptance: 'final' }
    expect(() => deserializeDocument(file({ type: 'NPDA', stack }))).toThrow('Leeres Symbol in Γ')
    const tape = { alphabet: ['a', '#'], blank: '' }
    expect(() => deserializeDocument(file({ type: 'TM', tape }))).toThrow('Blank ungültig')
  })

  it('lädt Übergänge zu fehlenden Zuständen – die meldet die Prüfung', () => {
    const t = { id: 't1', from: 's1', to: 'fehlt', labels: [{ read: 'a' }] }
    expect(deserializeDocument(file(graph([state], [t]))).graph.transitions).toEqual([t])
  })
})

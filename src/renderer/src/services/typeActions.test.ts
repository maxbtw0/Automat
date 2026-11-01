import { beforeEach, describe, expect, it } from 'vitest'
import { buildDocument } from '@/core/automaton/testing'
import { useDialogStore } from '@/store/dialogStore'
import { useEditorStore } from '@/store/editorStore'
import { changeAutomatonType } from './typeActions'

const store = () => useEditorStore.getState()

/** Nichtdeterministischer NEA: „endet auf ab“ */
const nfa = buildDocument('NFA', ['a', 'b'], { start: 'q0', finals: ['q2'] }, [
  ['q0', 'a,b', 'q0'],
  ['q0', 'a', 'q1'],
  ['q1', 'b', 'q2']
])

/** Startet den Typwechsel und beantwortet den Dialog mit Knopf `index`. */
async function switchToDfaAnswering(index: number): Promise<void> {
  const done = changeAutomatonType('DFA')
  expect(useDialogStore.getState().request?.title).toBe('NEA in DEA umwandeln?')
  useDialogStore.getState().answer(index)
  await done
}

beforeEach(() => store().loadDocument(structuredClone(nfa), null))

describe('changeAutomatonType NEA → DEA', () => {
  it('„Umwandeln“ ersetzt den NEA durch den DEA der Potenzmengenkonstruktion', async () => {
    await switchToDfaAnswering(0)
    expect(store().document.type).toBe('DFA')
    expect(store().document.graph.states).toHaveLength(3)
  })

  it('die Umwandlung ist ein Undo-Schritt', async () => {
    await switchToDfaAnswering(0)
    store().undo()
    expect(store().document).toEqual(nfa)
  })

  it('„Nur Typ wechseln“ behält den Graph', async () => {
    await switchToDfaAnswering(1)
    expect(store().document).toEqual({ ...nfa, type: 'DFA' })
  })

  it('„Abbrechen“ ändert nichts', async () => {
    await switchToDfaAnswering(2)
    expect(store().document).toEqual(nfa)
  })

  it('minimiert nach der Umwandlung', async () => {
    // Deterministischer NEA mit zwei äquivalenten Endzuständen q1, q2
    const det = buildDocument('NFA', ['a'], { start: 'q0', finals: ['q1', 'q2'] }, [
      ['q0', 'a', 'q1'],
      ['q1', 'a', 'q2'],
      ['q2', 'a', 'q2']
    ])
    store().loadDocument(det, null)
    await switchToDfaAnswering(0)
    expect(store().document.graph.states.map((s) => s.label).sort()).toEqual(['{q0}', '{q1}/{q2}'])
  })

  it('fragt nicht bei einem leeren Automaten', async () => {
    store().newDocument()
    store().setDocumentMeta({ type: 'NFA' })
    await changeAutomatonType('DFA')
    expect(useDialogStore.getState().request).toBeNull()
    expect(store().document.type).toBe('DFA')
  })
})

describe('changeAutomatonType mit Kellerautomat', () => {
  it('NEA → NKA ohne Rückfrage: Regeln legen das Top of Stack zurück', async () => {
    await changeAutomatonType('NPDA')
    expect(useDialogStore.getState().request).toBeNull()
    expect(store().document.type).toBe('NPDA')
    expect(store().document.stack?.alphabet).toEqual(['#'])
    expect(store().document.graph.transitions[0].labels[0]).toEqual({
      read: 'a',
      pop: '#',
      push: ['#']
    })
  })

  it('KA → NEA fragt, wenn Stackoperationen verloren gehen', async () => {
    store().loadDocument(
      buildDocument('NPDA', ['a'], { start: 'q0', stack: ['A', '#'] }, [['q0', 'a, # → A#', 'q0']]),
      null
    )
    const done = changeAutomatonType('NFA')
    expect(useDialogStore.getState().request?.title).toBe('Stackoperationen entfernen?')
    useDialogStore.getState().answer(1) // Abbrechen
    await done
    expect(store().document.type).toBe('NPDA')

    const again = changeAutomatonType('NFA')
    useDialogStore.getState().answer(0)
    await again
    expect(store().document.type).toBe('NFA')
    expect(store().document.stack).toBeUndefined()
    expect(store().document.graph.transitions[0].labels).toEqual([{ read: 'a' }])
  })
})

describe('changeAutomatonType mit Transduktoren', () => {
  const mealy = buildDocument('MEALY', ['a'], { start: 'q0', output: ['0', '1'] }, [
    ['q0', 'a/0', 'q1'],
    ['q1', 'a/1', 'q1']
  ])

  /** Startet den Typwechsel und beantwortet den Dialog `title` mit Knopf `index`. */
  async function switchAnswering(type: 'MEALY' | 'MOORE' | 'DFA', title: string, index: number) {
    const done = changeAutomatonType(type)
    expect(useDialogStore.getState().request?.title).toBe(title)
    useDialogStore.getState().answer(index)
    await done
  }

  it('Mealy → Moore „Umwandeln“ teilt Zustände nach der Ausgabe auf', async () => {
    store().loadDocument(structuredClone(mealy), null)
    await switchAnswering('MOORE', 'Mealy in Moore umwandeln?', 0)
    expect(store().document.type).toBe('MOORE')
    expect(store().document.graph.states.map((s) => [s.label, s.output])).toEqual([
      ['q0', []],
      ['q1_0', ['0']],
      ['q1_1', ['1']]
    ])
  })

  it('Mealy → Moore „Nur Typ ändern“ entfernt die Ausgaben', async () => {
    store().loadDocument(structuredClone(mealy), null)
    await switchAnswering('MOORE', 'Mealy in Moore umwandeln?', 1)
    expect(store().document.type).toBe('MOORE')
    expect(store().document.graph.transitions[0].labels).toEqual([{ read: 'a' }])
  })

  it('Mealy → DEA fragt, ob die Ausgaben wegfallen dürfen', async () => {
    store().loadDocument(structuredClone(mealy), null)
    await switchAnswering('DFA', 'Ausgaben entfernen?', 1)
    expect(store().document).toEqual(mealy)
    await switchAnswering('DFA', 'Ausgaben entfernen?', 0)
    expect(store().document.type).toBe('DFA')
    expect(store().document.output).toBeUndefined()
  })

  it('NEA mit Endzuständen → Mealy fragt, ob die Endzustände wegfallen dürfen', async () => {
    await switchAnswering('MEALY', 'Endzustände entfernen?', 0)
    expect(store().document.type).toBe('MEALY')
    expect(store().document.graph.states.some((s) => s.isFinal)).toBe(false)
  })
})

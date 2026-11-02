import { beforeEach, describe, expect, it } from 'vitest'
import { buildDocument } from '@/core/automaton/testing'
import { useDialogStore } from '@/store/dialogStore'
import { useEditorStore } from '@/store/editorStore'
import { toggleFinalState } from './stateActions'

const store = () => useEditorStore.getState()
const dialog = () => useDialogStore.getState()
const finals = () => store().document.graph.states.filter((s) => s.isFinal).map((s) => s.label)
const idOf = (label: string) => store().document.graph.states.find((s) => s.label === label)!.id

/** aⁿbⁿ, akzeptiert mit leerem Stack */
const emptyStack = buildDocument(
  'NPDA',
  ['a', 'b'],
  { start: 'q0', stack: ['#', 'A'], acceptance: 'empty' },
  [
    ['q0', 'a, # → A#; a, A → AA', 'q0'],
    ['q0', 'b, A → ε', 'q1'],
    ['q1', 'b, A → ε; ε, # → ε', 'q1']
  ]
)

/** Setzt q1 als Endzustand und beantwortet die Rückfrage mit Knopf `index`. */
async function setFinalAnswering(index: number): Promise<void> {
  const done = toggleFinalState(idOf('q1'))
  expect(dialog().request?.title).toBe('Akzeptanz mit Endzustand?')
  dialog().answer(index)
  await done
}

beforeEach(() => store().loadDocument(structuredClone(emptyStack), null))

describe('toggleFinalState bei Akzeptanz mit leerem Stack', () => {
  it('„Auf Endzustand wechseln“ setzt Endzustand und Akzeptanz', async () => {
    await setFinalAnswering(0)
    expect(finals()).toEqual(['q1'])
    expect(store().document.stack?.acceptance).toBe('final')
  })

  it('Endzustand und Akzeptanz sind ein Undo-Schritt', async () => {
    await setFinalAnswering(0)
    store().undo()
    expect(store().document).toEqual(emptyStack)
  })

  it('„Nur Endzustand setzen“ behält die Akzeptanz', async () => {
    await setFinalAnswering(1)
    expect(finals()).toEqual(['q1'])
    expect(store().document.stack?.acceptance).toBe('empty')
  })

  it('„Abbrechen“ ändert nichts', async () => {
    await setFinalAnswering(2)
    expect(store().document).toEqual(emptyStack)
  })

  it('fragt nur beim ersten Endzustand', async () => {
    await setFinalAnswering(1)
    await toggleFinalState(idOf('q0'))
    expect(dialog().request).toBeNull()
    expect(finals()).toEqual(['q0', 'q1'])
  })

  it('fragt nicht beim Entfernen eines Endzustands', async () => {
    await setFinalAnswering(1)
    await toggleFinalState(idOf('q1'))
    expect(dialog().request).toBeNull()
    expect(finals()).toEqual([])
  })
})

describe('toggleFinalState ohne Rückfrage', () => {
  it('Kellerautomat mit Akzeptanz durch Endzustand', async () => {
    const stack = { ...emptyStack.stack!, acceptance: 'final' as const }
    store().loadDocument({ ...structuredClone(emptyStack), stack }, null)
    await toggleFinalState(idOf('q1'))
    expect(dialog().request).toBeNull()
    expect(finals()).toEqual(['q1'])
  })

  it('NEA', async () => {
    store().loadDocument(buildDocument('NFA', ['a'], { start: 'q0' }, [['q0', 'a', 'q1']]), null)
    await toggleFinalState(idOf('q1'))
    expect(dialog().request).toBeNull()
    expect(finals()).toEqual(['q1'])
  })
})

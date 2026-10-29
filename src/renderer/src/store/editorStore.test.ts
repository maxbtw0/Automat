import { beforeEach, describe, expect, it } from 'vitest'
import { createEmptyDocument, symbolLabels } from '@/model/graph'
import { useEditorStore } from './editorStore'

const store = () => useEditorStore.getState()

/** Zwei Zustände q0 → q1 mit Übergang über a, b und Alphabet {a, b}. */
function setupAB(): { transitionId: string } {
  store().addSymbol()
  store().addSymbol()
  const from = store().addState(0, 0)
  const to = store().addState(100, 0)
  const transitionId = store().addTransition(from, to)
  store().updateTransition(transitionId, { labels: symbolLabels(['a', 'b']) })
  return { transitionId }
}

const transitionSymbols = (id: string): string[] | undefined =>
  store()
    .document.graph.transitions.find((t) => t.id === id)
    ?.labels.map((l) => l.read)

// Der Store ist ein Modul-Singleton – vor jedem Test auf ein leeres Dokument zurücksetzen.
beforeEach(() => store().newDocument())

describe('renameSymbol', () => {
  it('benennt das Symbol im Alphabet und in allen Übergängen um', () => {
    const { transitionId } = setupAB()
    store().renameSymbol('a', 'x')

    expect(store().document.alphabet).toEqual(['x', 'b'])
    expect(transitionSymbols(transitionId)).toEqual(['x', 'b'])
  })
})

describe('addTransitionLabels', () => {
  it('hängt neue Regeln an und überspringt vorhandene', () => {
    const { transitionId } = setupAB()
    store().addSymbol()
    store().addTransitionLabels(transitionId, symbolLabels(['b', 'c']))

    expect(transitionSymbols(transitionId)).toEqual(['a', 'b', 'c'])
  })

  it('ist ein Undo-Schritt', () => {
    const { transitionId } = setupAB()
    store().addTransitionLabels(transitionId, symbolLabels(['c']))
    store().undo()

    expect(transitionSymbols(transitionId)).toEqual(['a', 'b'])
  })

  it('legt ohne neue Regel keinen Verlaufseintrag an', () => {
    const { transitionId } = setupAB()
    const historyLength = store().past.length
    store().addTransitionLabels(transitionId, symbolLabels(['a']))

    expect(store().past).toHaveLength(historyLength)
  })
})

describe('sortAlphabet', () => {
  it('sortiert alphabetisch, Zahlen nach Wert (x2 vor x10)', () => {
    store().setDocumentMeta({ alphabet: ['c', 'x10', 'a', 'x2', 'b'] })
    store().sortAlphabet()

    expect(store().document.alphabet).toEqual(['a', 'b', 'c', 'x2', 'x10'])
  })

  it('legt keinen Verlaufseintrag an, wenn schon sortiert', () => {
    store().setDocumentMeta({ alphabet: ['a', 'b'] })
    const historyLength = store().past.length

    store().sortAlphabet()

    expect(store().past).toHaveLength(historyLength)
  })
})

describe('applyAlphabetPreset', () => {
  it('ersetzt das Alphabet durch das Preset', () => {
    store().setDocumentMeta({ alphabet: ['x', 'y'] })
    const kept = store().applyAlphabetPreset(['0', '1'])

    expect(store().document.alphabet).toEqual(['0', '1'])
    expect(kept).toEqual([])
  })

  it('behält Symbole, die in Übergängen benutzt werden', () => {
    setupAB() // Alphabet {a, b}, beide im Übergang benutzt
    const kept = store().applyAlphabetPreset(['0', '1', 'b'])

    expect(store().document.alphabet).toEqual(['0', '1', 'b', 'a'])
    expect(kept).toEqual(['a'])
  })

  it('behält beim Stackalphabet das Startsymbol, auch wenn es unbenutzt ist', () => {
    store().loadDocument(createEmptyDocument('DPDA'), null)
    store().applyAlphabetPreset(['A', 'B'], 'stack')

    expect(store().document.stack?.alphabet).toEqual(['A', 'B', '#'])
    expect(store().document.stack?.start).toBe('#')
  })
})

describe('Ungespeicherte Änderungen (dirty)', () => {
  it('Undo bis zum gespeicherten Stand macht dirty wieder false, Redo wieder true', () => {
    store().addState(0, 0)
    store().markSaved('dea.json')
    store().addState(100, 0)
    expect(store().dirty).toBe(true)

    store().undo()
    expect(store().dirty).toBe(false)
    store().redo()
    expect(store().dirty).toBe(true)
  })

  it('Undo hinter den gespeicherten Stand zurück ist wieder ungespeichert', () => {
    store().addState(0, 0)
    store().markSaved('dea.json')
    store().undo()
    expect(store().dirty).toBe(true)
  })

  it('markSaved mit älterem Stand lässt neuere Änderungen ungespeichert', () => {
    store().addState(0, 0)
    const saved = store().document
    store().addState(100, 0)
    store().markSaved('dea.json', saved)
    expect(store().dirty).toBe(true)
    store().undo()
    expect(store().dirty).toBe(false)
  })

  it('Verschieben per Drag ist eine Änderung, ein Snapshot allein nicht', () => {
    const id = store().addState(0, 0)
    store().markSaved('dea.json')
    store().snapshot()
    expect(store().dirty).toBe(false)
    store().moveStateLive(id, 50, 50)
    expect(store().dirty).toBe(true)
  })
})

describe('deleteSymbol', () => {
  it('entfernt das Symbol aus dem Alphabet und aus allen Übergängen', () => {
    const { transitionId } = setupAB()
    store().deleteSymbol(0)

    expect(store().document.alphabet).toEqual(['b'])
    expect(transitionSymbols(transitionId)).toEqual(['b'])
  })

  it('ändert bei ungültigem Index nichts und legt keinen Verlaufseintrag an', () => {
    setupAB()
    const before = store().document
    const historyLength = store().past.length

    store().deleteSymbol(5)

    expect(store().document).toBe(before)
    expect(store().past).toHaveLength(historyLength)
  })

  it('lässt sich mit undo() rückgängig machen', () => {
    const { transitionId } = setupAB()
    store().deleteSymbol(0)
    store().undo()

    expect(store().document.alphabet).toEqual(['a', 'b'])
    expect(transitionSymbols(transitionId)).toEqual(['a', 'b'])
  })
})

describe('Übergangstabelle', () => {
  it('replaceTransitionEntry ist ein einziger Undo-Schritt', () => {
    setupAB()
    const [from, to] = store().document.graph.states.map((s) => s.id)
    const before = store().document

    store().replaceTransitionEntry({ from, symbol: 'a', to }, { from: to, symbol: 'a', to: from })
    expect(store().document).not.toBe(before)

    store().undo()
    expect(store().document).toBe(before)
  })

  it('hebt die Auswahl auf, wenn der ausgewählte Übergang verschwindet', () => {
    const { transitionId } = setupAB()
    const [from, to] = store().document.graph.states.map((s) => s.id)
    store().select({ kind: 'transition', id: transitionId })

    store().removeTransitionEntry({ from, symbol: 'a', to })
    store().removeTransitionEntry({ from, symbol: 'b', to })

    expect(store().selection).toBeNull()
  })
})

describe('addStateWithEntry', () => {
  it('legt Zustand und Zeile in einem Undo-Schritt an', () => {
    setupAB()
    const [from, to] = store().document.graph.states.map((s) => s.id)
    const before = store().document

    const id = store().addStateWithEntry({ from, symbol: 'a', to }, (newId) => ({
      from,
      symbol: 'a',
      to: newId
    }))

    const created = store().document.graph.states.find((s) => s.id === id)
    expect(created).toMatchObject({ label: 'q2', isStart: false })
    const moved = store().document.graph.transitions.find((t) => t.from === from && t.to === id)
    expect(moved?.labels).toEqual([{ read: 'a' }])

    store().undo()
    expect(store().document).toBe(before)
  })

  it('übernimmt eine getippte Bezeichnung', () => {
    store().addSymbol()
    const id = store().addStateWithEntry(
      null,
      (newId) => ({ from: newId, symbol: 'a', to: newId }),
      'ende'
    )
    expect(store().document.graph.states.find((s) => s.id === id)?.label).toBe('ende')
  })

  it('macht den ersten Zustand zum Startzustand', () => {
    store().addSymbol()
    const id = store().addStateWithEntry(null, (newId) => ({ from: newId, symbol: 'a', to: newId }))
    expect(store().document.graph.states).toEqual([expect.objectContaining({ id, isStart: true })])
  })
})

describe('Stackalphabet Γ', () => {
  /** NKA mit Γ = {#, A}, Σ = {a} und Regel „a, # → A#“ */
  function setupStack(): { transitionId: string } {
    store().loadDocument(createEmptyDocument('NPDA'), null)
    store().addSymbol()
    store().addSymbol('stack')
    const q = store().addState(0, 0)
    const transitionId = store().addTransition(q, q)
    store().updateTransition(transitionId, { labels: [{ read: 'a', pop: '#', push: ['A', '#'] }] })
    return { transitionId }
  }
  const labels = (id: string) => store().document.graph.transitions.find((t) => t.id === id)?.labels

  it('legt Stacksymbole groß an (A, B, …)', () => {
    setupStack()
    expect(store().document.stack?.alphabet).toEqual(['#', 'A'])
  })

  it('benennt in pop, push und beim Startsymbol um', () => {
    const { transitionId } = setupStack()
    store().renameSymbol('#', 'Z', 'stack')

    expect(store().document.stack).toMatchObject({ alphabet: ['Z', 'A'], start: 'Z' })
    expect(labels(transitionId)).toEqual([{ read: 'a', pop: 'Z', push: ['A', 'Z'] }])
    expect(store().document.alphabet).toEqual(['a'])
  })

  it('löscht ein Stacksymbol samt Regeln, die es benutzen', () => {
    const { transitionId } = setupStack()
    store().deleteSymbol(1, 'stack')

    expect(store().document.stack?.alphabet).toEqual(['#'])
    expect(labels(transitionId)).toEqual([])
  })

  it('löscht das Startsymbol → Stack startet leer', () => {
    setupStack()
    store().deleteSymbol(0, 'stack')
    expect(store().document.stack?.start).toBeNull()
  })

  it('setzt die Akzeptanz als ein Undo-Schritt', () => {
    setupStack()
    store().setStackSettings({ acceptance: 'empty' })
    expect(store().document.stack?.acceptance).toBe('empty')
    store().undo()
    expect(store().document.stack?.acceptance).toBe('final')
  })
})

describe('Turingmaschine', () => {
  beforeEach(() => store().loadDocument(createEmptyDocument('TM'), null))

  const tape = () => store().document.tape

  it('neue Σ-Symbole landen auch im Bandalphabet (vor dem Blank)', () => {
    store().addSymbol()
    store().addSymbol('tape')
    store().addSymbol()
    expect(store().document.alphabet).toEqual(['a', 'b'])
    expect(tape()?.alphabet).toEqual(['a', 'b', '#', 'A'])
  })

  it('benennt Σ-Symbole auch auf dem Band und in den Regeln um', () => {
    store().addSymbol()
    const q0 = store().addState(0, 0)
    store().setTuringCell(q0, 'a', { to: q0, write: 'a', move: 'R' })
    store().renameSymbol('a', 'x')
    expect(tape()?.alphabet).toEqual(['x', '#'])
    expect(store().document.graph.transitions[0].labels).toEqual([
      { read: 'x', write: 'x', move: 'R' }
    ])
  })

  it('Blank umbenennen ändert auch die Regeln', () => {
    const q0 = store().addState(0, 0)
    store().setTuringCell(q0, '#', { to: q0, write: '#', move: 'L' })
    store().renameSymbol('#', 'B', 'tape')
    expect(tape()).toEqual({ alphabet: ['B'], blank: 'B' })
    expect(store().document.graph.transitions[0].labels).toEqual([
      { read: 'B', write: 'B', move: 'L' }
    ])
  })

  it('Löschen aus Σ lässt das Bandsymbol und die Regeln stehen', () => {
    store().addSymbol()
    const q0 = store().addState(0, 0)
    store().setTuringCell(q0, 'a', { to: q0, write: 'a', move: 'R' })
    store().deleteSymbol(0)
    expect(store().document.alphabet).toEqual([])
    expect(tape()?.alphabet).toEqual(['a', '#'])
    expect(store().document.graph.transitions[0].labels).toHaveLength(1)
  })

  it('Voreinstellung fürs Band behält Σ und das Blank', () => {
    store().addSymbol()
    store().applyAlphabetPreset(['X', 'Y'], 'tape')
    expect(tape()?.alphabet).toEqual(['a', 'X', 'Y', '#'])
  })

  it('Zelle mit neuem Folgezustand ist ein Undo-Schritt', () => {
    const q0 = store().addState(0, 0)
    const before = store().past.length
    const to = store().setTuringCell(q0, '#', { to: q0, write: '#', move: 'N' }, '')
    const { states, transitions } = store().document.graph
    expect(states.map((s) => s.label)).toEqual(['q0', 'q1'])
    expect(transitions).toEqual([
      expect.objectContaining({ from: q0, to, labels: [{ read: '#', write: '#', move: 'N' }] })
    ])
    expect(store().past).toHaveLength(before + 1)
    store().undo()
    expect(store().document.graph.states).toHaveLength(1)
  })

  it('unveränderte Zelle legt keinen Verlaufseintrag an', () => {
    const q0 = store().addState(0, 0)
    store().setTuringCell(q0, '#', { to: q0, write: '#', move: 'N' })
    const before = store().past.length
    store().setTuringCell(q0, '#', { to: q0, write: '#', move: 'N' })
    expect(store().past).toHaveLength(before)
  })
})

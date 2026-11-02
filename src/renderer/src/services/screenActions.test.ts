import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createEmptyDocument } from '@/model/graph'
import { scopeOfScreen } from '@/services/keyActions'
import { useEditorStore } from '@/store/editorStore'
import { useScreenStore } from '@/store/screenStore'
import { initScreenGuard, openRegularExpressionsEditor } from './screenActions'

describe('Screen nach Typwechsel', () => {
  let stop = (): void => undefined

  beforeEach(() => {
    useEditorStore.getState().loadDocument(createEmptyDocument('DFA'), null)
    useScreenStore.setState({ screen: 'regex' })
    stop = initScreenGuard()
  })

  afterEach(() => stop())

  it('geht aus der Regex-Ansicht in den Grapheneditor, wenn der Typ keine hat', () => {
    expect(useScreenStore.getState().screen).toBe('regex')
    useEditorStore.getState().applyDocument(createEmptyDocument('TM'))
    expect(useScreenStore.getState().screen).toBe('graph')
    // Die Tastenkürzel des Grapheneditors (S = Zustand-Werkzeug) gelten damit sofort
    expect(scopeOfScreen(useScreenStore.getState().screen)).toBe('graph')
  })

  it('öffnet die Regex-Ansicht nur bei endlichen Automaten', () => {
    useEditorStore.getState().applyDocument(createEmptyDocument('NPDA'))
    openRegularExpressionsEditor()
    expect(useScreenStore.getState().screen).toBe('graph')
    useScreenStore.setState({ screen: 'regex' })
    expect(useScreenStore.getState().screen).toBe('graph')
  })
})

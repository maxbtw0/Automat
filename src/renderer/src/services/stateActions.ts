import { findState, stackSettings, usesStack, type StateId } from '@/model/graph'
import { askChoice } from '@/store/dialogStore'
import { useEditorStore } from '@/store/editorStore'

const SWITCH = 0
const KEEP = 1

/**
 * Schaltet den Endzustand um. Akzeptiert ein Kellerautomat mit leerem Stack und wird der erste
 * Endzustand gesetzt, fragt ein kleines Fenster, ob die Akzeptanz auf Endzustand wechseln soll
 * (Endzustände zählen sonst nicht). Wechseln ist mit dem Endzustand ein Undo-Schritt.
 */
export async function toggleFinalState(id: StateId): Promise<void> {
  const store = useEditorStore.getState()
  const { document } = store
  const state = findState(document.graph, id)
  if (!state) return
  const firstFinal = !state.isFinal && document.graph.states.every((s) => !s.isFinal)
  if (!usesStack(document.type) || stackSettings(document).acceptance !== 'empty' || !firstFinal) {
    store.toggleFinal(id)
    return
  }
  const choice = await askChoice({
    title: 'Akzeptanz mit Endzustand?',
    detail: 'Der Kellerautomat akzeptiert mit leerem Stack.',
    buttons: ['Auf Endzustand wechseln', 'Nur Endzustand setzen', 'Abbrechen']
  })
  if (choice === SWITCH) useEditorStore.getState().toggleFinal(id, 'final')
  else if (choice === KEEP) useEditorStore.getState().toggleFinal(id)
}

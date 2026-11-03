import {
  findState,
  removeTransitionEntry,
  stackSettings,
  usesStack,
  type StateId,
  type TransitionEntry
} from '@/model/graph'
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

/**
 * Löscht einen Zustand samt seiner Übergänge. Hängen Übergänge daran, fragt erst ein kleines
 * Fenster. Liefert `true`, wenn gelöscht wurde.
 */
export function deleteStateAsking(id: StateId): Promise<boolean> {
  return deleteStatesAsking([id])
}

/**
 * Wie `deleteStateAsking` für mehrere Zustände – eine Rückfrage, ein Undo-Schritt. `entries`:
 * Tabellenzeilen, die im selben Schritt verschwinden (zählen nicht als mitgelöscht).
 */
export async function deleteStatesAsking(
  ids: StateId[],
  entries: TransitionEntry[] = []
): Promise<boolean> {
  const graph = entries.reduce(
    removeTransitionEntry,
    useEditorStore.getState().document.graph
  )
  const states = graph.states.filter((s) => ids.includes(s.id))
  if (states.length === 0) return false
  const removed = new Set(states.map((s) => s.id))
  const count = graph.transitions.filter((t) => removed.has(t.from) || removed.has(t.to)).length
  if (count > 0) {
    const choice = await askChoice({
      title:
        states.length === 1 ? `„${states[0].label}“ löschen?` : `${states.length} Zustände löschen?`,
      detail:
        count === 1
          ? 'Ein Übergang hängt daran und wird mitgelöscht.'
          : `${count} Übergänge hängen daran und werden mitgelöscht.`,
      buttons: ['Löschen', 'Abbrechen'],
      danger: 0
    })
    if (choice !== 0) return false
  }
  useEditorStore.getState().deleteRows(entries, [...removed])
  return true
}

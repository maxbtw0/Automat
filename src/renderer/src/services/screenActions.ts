import { getAutomatonDefinition } from '@/core/automaton/registry'
import { useEditorStore } from '@/store/editorStore'
import { useScreenStore, type Screen } from '@/store/screenStore'

/** Reguläre Ausdrücke gibt es nur für endliche Automaten */
function isAvailable(screen: Screen): boolean {
  return screen !== 'regex' || getAutomatonDefinition(useEditorStore.getState().document.type).regex
}

/**
 * Hält den Screen gültig: Wechselt der Typ (Auswahl, Öffnen, Rückgängig) zu einem ohne
 * Regex-Ansicht, geht es sofort in den Grapheneditor – so sehen Router, Statusleiste und
 * Tastenkürzel denselben Screen. Liefert die Abmeldung.
 */
export function initScreenGuard(): () => void {
  const check = (): void => {
    const { screen, setScreen } = useScreenStore.getState()
    if (!isAvailable(screen)) setScreen('graph')
  }
  check()
  const stopEditor = useEditorStore.subscribe((state, prev) => {
    if (state.document.type !== prev.document.type) check()
  })
  const stopScreen = useScreenStore.subscribe((state, prev) => {
    if (state.screen !== prev.screen) check()
  })
  return () => {
    stopEditor()
    stopScreen()
  }
}

export function openSimulationEditor(): void {
  useScreenStore.getState().setScreen('simulation')
}

export function openGraphEditor(): void {
  useScreenStore.getState().setScreen('graph')
}

export function openAlphabetEditor(): void {
  useScreenStore.getState().setScreen('alphabet')
}

export function openRegularExpressionsEditor(): void {
  if (isAvailable('regex')) useScreenStore.getState().setScreen('regex')
}

export function openTransitionTableEditor(): void {
  useScreenStore.getState().setScreen('transitionTable')
}

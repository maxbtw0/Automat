import { useEffect } from 'react'
import { KEY_ACTIONS } from '@shared/keybindings'
import { keyActionForEvent, runKeyAction, scopeOfScreen } from '@/services/keyActions'
import { isModalOpen } from '@/store/dialogStore'
import { useScreenStore } from '@/store/screenStore'

/**
 * Globale Tastenkürzel aus den Einstellungen. Die Kürzel der Simulation behandelt
 * `SimulationScreen` selbst, weil nur er die Steuerung kennt.
 */
export function useShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      // Solange ein Dialog offen ist, gehören die Tasten ihm.
      if (isModalOpen()) return
      const action = keyActionForEvent(e, scopeOfScreen(useScreenStore.getState().screen))
      if (!action || KEY_ACTIONS[action].scope === 'simulation') return
      e.preventDefault()
      runKeyAction(action)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}

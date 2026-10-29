import {
  newAutomatonAlphabet,
  normalizeSettings,
  serializeSettings,
  type Settings
} from '@shared/settings'
import { describeError } from '@/core/automaton/errors'
import { setSimulationLimits } from '@/core/automaton/limits'
import { createEmptyDocument, setDocumentDefaults, type AutomatonDocument } from '@/model/graph'
import { useDialogStore } from '@/store/dialogStore'
import { useEditorStore } from '@/store/editorStore'
import { useScreenStore } from '@/store/screenStore'
import { useSettingsStore } from '@/store/settingsStore'

/** Im Browser (ohne Electron) liegen die Einstellungen im localStorage. */
const STORAGE_KEY = 'automat.settings'

async function readSettings(): Promise<Settings> {
  if (window.api) return window.api.loadSettings()
  return normalizeSettings(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'))
}

async function writeSettings(settings: Settings): Promise<void> {
  if (window.api) await window.api.saveSettings(settings)
  else localStorage.setItem(STORAGE_KEY, serializeSettings(settings))
}

/** Neuer Automat nach den Vorgaben: Typ und Alphabet aus den Einstellungen. */
export function createConfiguredDocument(): AutomatonDocument {
  const { settings } = useSettingsStore.getState()
  return createEmptyDocument(settings.newAutomaton.type, newAutomatonAlphabet(settings))
}

/** Gibt die Einstellungen an Modell und Simulation weiter. */
function applySettings(settings: Settings, previous: Settings | null): void {
  setDocumentDefaults(settings.newAutomaton)
  setSimulationLimits(settings.simulation)
  // Der Regler auf dem Screen startet mit der eingestellten Geschwindigkeit
  if (settings.simulation.speed !== previous?.simulation.speed) {
    useScreenStore.getState().setSimulationSpeed(settings.simulation.speed)
  }
}

/** Unberührter leerer Automat vom Programmstart – darf durch die Vorgaben ersetzt werden. */
function isPristine(): boolean {
  const { dirty, filePath, past, future, document } = useEditorStore.getState()
  return (
    !dirty &&
    filePath === null &&
    past.length === 0 &&
    future.length === 0 &&
    document.graph.states.length === 0 &&
    document.alphabet.length === 0
  )
}

/**
 * Lädt die Einstellungen und speichert danach jede Änderung. Liefert eine Abmelde-Funktion.
 */
export function initSettings(): () => void {
  let unsubscribe: (() => void) | null = null
  let cancelled = false
  void readSettings()
    .catch(() => null)
    .then((settings) => {
      if (cancelled) return
      if (settings) useSettingsStore.getState().setSettings(settings)
      applySettings(useSettingsStore.getState().settings, null)
      if (isPristine()) useEditorStore.getState().loadDocument(createConfiguredDocument(), null)
      // Erst nach dem Laden abonnieren – sonst würde das Laden selbst gleich wieder speichern.
      unsubscribe = useSettingsStore.subscribe((state, prev) => {
        if (state.settings === prev.settings) return
        applySettings(state.settings, prev.settings)
        writeSettings(state.settings).catch((err: unknown) => {
          useEditorStore.getState().setStatus({
            kind: 'error',
            text: `Einstellungen speichern fehlgeschlagen: ${describeError(err)}`
          })
        })
      })
    })
  return () => {
    cancelled = true
    unsubscribe?.()
  }
}

export function openSettings(): void {
  useDialogStore.getState().setSettingsOpen(true)
}

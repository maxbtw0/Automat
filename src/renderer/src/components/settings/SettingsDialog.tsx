import { useEffect, useState } from 'react'
import { sameSettings, settingsValid, type Settings } from '@shared/settings'
import { askChoice, useDialogStore } from '@/store/dialogStore'
import { useSettingsStore } from '@/store/settingsStore'
import { classNames, inertOutside, isEditableTarget } from '@/utils/dom'
import { AlphabetPresetsTab } from './AlphabetPresetsTab'
import { KeybindingsTab } from './KeybindingsTab'
import { NewAutomatonTab } from './NewAutomatonTab'
import { SimulationTab } from './SimulationTab'

type SettingsTab = 'keybindings' | 'newAutomaton' | 'alphabetPresets' | 'simulation'

const TABS: { tab: SettingsTab; label: string }[] = [
  { tab: 'keybindings', label: 'Tastenkürzel' },
  { tab: 'newAutomaton', label: 'Neuer Automat' },
  { tab: 'alphabetPresets', label: 'Alphabete' },
  { tab: 'simulation', label: 'Simulation' }
]

/**
 * Einstellungen: links die Reiter, rechts ihr Inhalt. Geändert wird ein Entwurf – erst
 * „Speichern“ übernimmt ihn und schließt, „Schließen“ mit ungespeicherten Änderungen fragt nach.
 */
export function SettingsDialog() {
  const open = useDialogStore((s) => s.settingsOpen)
  // Eigene Komponente: bei jedem Öffnen entsteht der Entwurf frisch aus dem gespeicherten Stand.
  return open ? <SettingsWindow /> : null
}

function SettingsWindow() {
  const saved = useSettingsStore((s) => s.settings)
  const [draft, setDraft] = useState<Settings>(saved)
  const [tab, setTab] = useState<SettingsTab>('keybindings')
  const dirty = !sameSettings(draft, saved)
  const valid = settingsValid(draft)

  const save = (): void => {
    useSettingsStore.getState().setSettings(draft)
    useDialogStore.getState().setSettingsOpen(false)
  }

  const close = async (): Promise<void> => {
    if (dirty) {
      const choice = await askChoice({
        title: 'Änderungen verwerfen?',
        buttons: ['Verwerfen', 'Abbrechen'],
        danger: 0
      })
      if (choice !== 0) return
    }
    useDialogStore.getState().setSettingsOpen(false)
  }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      // Eine Rückfrage darüber bekommt ihr Esc selbst, ein Eingabefeld verwirft damit seine
      // Eingabe.
      if (e.key !== 'Escape' || isEditableTarget(e.target)) return
      if (!useDialogStore.getState().request) void close()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [dirty])

  return (
    <div className="dialog-backdrop" ref={inertOutside}>
      <div
        className="dialog settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <h2 id="settings-title" className="dialog-title">
          Einstellungen
        </h2>
        <div className="settings-body">
          <nav className="settings-tabs" role="tablist" aria-orientation="vertical">
            {TABS.map((t) => (
              <button
                key={t.tab}
                role="tab"
                aria-selected={t.tab === tab}
                className={classNames('settings-tab', t.tab === tab && 'is-active')}
                onClick={() => setTab(t.tab)}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <div className="settings-content" role="tabpanel">
            {tab === 'keybindings' && (
              <KeybindingsTab
                bindings={draft.keybindings}
                navigation={draft.navigation}
                onChange={(keybindings) => setDraft({ ...draft, keybindings })}
                onNavigationChange={(navigation) => setDraft({ ...draft, navigation })}
              />
            )}
            {tab === 'newAutomaton' && (
              <NewAutomatonTab
                value={draft.newAutomaton}
                presets={draft.alphabetPresets}
                onChange={(newAutomaton) => setDraft({ ...draft, newAutomaton })}
              />
            )}
            {tab === 'simulation' && (
              <SimulationTab
                value={draft.simulation}
                onChange={(simulation) => setDraft({ ...draft, simulation })}
              />
            )}
            {tab === 'alphabetPresets' && (
              <AlphabetPresetsTab
                presets={draft.alphabetPresets}
                onChange={(alphabetPresets) => setDraft({ ...draft, alphabetPresets })}
              />
            )}
          </div>
        </div>
        <div className="dialog-buttons">
          <button className="btn is-primary" disabled={!dirty || !valid} onClick={save}>
            Speichern
          </button>
          <button className="btn" autoFocus onClick={() => void close()}>
            Schließen
          </button>
        </div>
      </div>
    </div>
  )
}

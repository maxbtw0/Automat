import { useEffect, useState } from 'react'
import {
  KEY_ACTION_IDS,
  KEY_ACTIONS,
  comboFromEvent,
  defaultKeybindings,
  findConflict,
  formatCombo,
  type KeyAction,
  type Keybindings
} from '@shared/keybindings'
import {
  DEFAULT_NAVIGATION,
  PAN_KEYS,
  PAN_KEY_LABELS,
  sameNavigation,
  type NavigationSettings,
  type PanKey
} from '@shared/navigationSettings'
import { Icon } from '@/components/common/Icon'
import { askChoice } from '@/store/dialogStore'
import { classNames } from '@/utils/dom'
import { SettingsSegmented } from './SettingsFields'

/** Gerade aufgenommenes Kürzel: ersetzt das an Position `index` oder kommt neu dazu (`null`). */
interface Recording {
  action: KeyAction
  index: number | null
}

const GROUPS = [...new Set(KEY_ACTION_IDS.map((id) => KEY_ACTIONS[id].group))].map((group) => ({
  group,
  actions: KEY_ACTION_IDS.filter((id) => KEY_ACTIONS[id].group === group)
}))

function isDefault(action: KeyAction, combos: string[]): boolean {
  const defaults = KEY_ACTIONS[action].defaults
  return combos.length === defaults.length && combos.every((c, i) => c === defaults[i])
}

/**
 * Tastenkürzel: pro Aktion beliebig viele Kombinationen. Klick auf ein Kürzel oder „+“ nimmt
 * den nächsten Tastendruck auf, Esc oder Klick daneben bricht ab. Dazu die Taste, die man zum
 * Verschieben der Ansicht gedrückt hält. Bearbeitet wird ein Entwurf – gespeichert wird erst im
 * Einstellungen-Fenster.
 */
export function KeybindingsTab({
  bindings,
  navigation,
  onChange,
  onNavigationChange
}: {
  bindings: Keybindings
  navigation: NavigationSettings
  onChange(bindings: Keybindings): void
  onNavigationChange(navigation: NavigationSettings): void
}) {
  const setKeybinding = (action: KeyAction, combos: string[]): void =>
    onChange({ ...bindings, [action]: combos })
  const [recording, setRecording] = useState<Recording | null>(null)
  const [error, setError] = useState<{ action: KeyAction; text: string } | null>(null)

  useEffect(() => {
    if (!recording) return
    const onKeyDown = (e: KeyboardEvent): void => {
      // Vor allen anderen Listenern: die Taste gehört der Aufnahme, nicht dem Programm.
      e.preventDefault()
      e.stopImmediatePropagation()
      const combo = comboFromEvent(e)
      if (!combo) return
      setRecording(null)
      if (combo === 'Escape') return
      const { action, index } = recording
      const conflict = findConflict(bindings, action, combo)
      if (conflict) {
        setError({
          action,
          text: `„${formatCombo(combo)}“ schon bei „${KEY_ACTIONS[conflict].label}“`
        })
        return
      }
      const current = bindings[action]
      const next =
        index === null ? [...current, combo] : current.map((c, i) => (i === index ? combo : c))
      setKeybinding(action, [...new Set(next)])
      setError(null)
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [recording, bindings])

  const record = (action: KeyAction, index: number | null): void => {
    setError(null)
    setRecording({ action, index })
  }

  const remove = (action: KeyAction, index: number): void => {
    setError(null)
    setKeybinding(action, bindings[action].filter((_, i) => i !== index))
  }

  const resetAll = async (): Promise<void> => {
    const choice = await askChoice({
      title: 'Alle Tastenkürzel zurücksetzen?',
      buttons: ['Zurücksetzen', 'Abbrechen'],
      danger: 0
    })
    if (choice !== 0) return
    setError(null)
    onChange(defaultKeybindings())
    onNavigationChange({ ...DEFAULT_NAVIGATION })
  }

  const allDefault =
    KEY_ACTION_IDS.every((id) => isDefault(id, bindings[id])) &&
    sameNavigation(navigation, DEFAULT_NAVIGATION)
  const isRecording = (action: KeyAction, index: number | null): boolean =>
    recording?.action === action && recording.index === index

  return (
    <div className="keybindings">
      <div className="keybindings-toolbar">
        <button className="btn is-ghost" disabled={allDefault} onClick={() => void resetAll()}>
          <Icon name="reset" /> Alle zurücksetzen
        </button>
      </div>
      {GROUPS.map(({ group, actions }) => (
        <section key={group} className="keybindings-group">
          <h3 className="section-label">{group}</h3>
          {actions.map((action) => (
            <div key={action} className="keybinding-row">
              <span className="keybinding-label">{KEY_ACTIONS[action].label}</span>
              <div className="keybinding-keys">
                {bindings[action].map((combo, i) => (
                  <span
                    key={combo}
                    className={classNames(
                      'keybinding-chip',
                      isRecording(action, i) && 'is-recording'
                    )}
                  >
                    <button
                      className="keybinding-key"
                      onClick={() => record(action, i)}
                      onBlur={() => setRecording(null)}
                    >
                      {isRecording(action, i) ? '…' : formatCombo(combo)}
                    </button>
                    <button
                      className="keybinding-remove"
                      title="Entfernen"
                      aria-label={`${formatCombo(combo)} entfernen`}
                      onClick={() => remove(action, i)}
                    >
                      <Icon name="close" size={12} />
                    </button>
                  </span>
                ))}
                {isRecording(action, null) ? (
                  <span className="keybinding-chip is-recording">
                    <button className="keybinding-key" autoFocus onBlur={() => setRecording(null)}>
                      …
                    </button>
                  </span>
                ) : (
                  <button
                    className="btn is-ghost is-icon keybinding-add"
                    title="Kürzel hinzufügen"
                    onClick={() => record(action, null)}
                  >
                    <Icon name="plus" size={14} />
                  </button>
                )}
              </div>
              <button
                className={classNames(
                  'btn is-ghost is-icon keybinding-reset',
                  isDefault(action, bindings[action]) && 'is-hidden'
                )}
                title="Standard"
                aria-label={`${KEY_ACTIONS[action].label}: Standard`}
                onClick={() => {
                  setError(null)
                  setKeybinding(action, [...KEY_ACTIONS[action].defaults])
                }}
              >
                <Icon name="reset" size={14} />
              </button>
              {error?.action === action && <p className="keybinding-error">{error.text}</p>}
            </div>
          ))}
          {group === 'Grapheneditor' && (
            <NavigationRows value={navigation} onChange={onNavigationChange} />
          )}
        </section>
      ))}
    </div>
  )
}

/** Ansicht verschieben: Taste gedrückt halten und ziehen, mittlere Maustaste */
function NavigationRows({
  value,
  onChange
}: {
  value: NavigationSettings
  onChange(value: NavigationSettings): void
}) {
  const reset = (field: keyof NavigationSettings) => (
    <button
      className={classNames(
        'btn is-ghost is-icon keybinding-reset',
        value[field] === DEFAULT_NAVIGATION[field] && 'is-hidden'
      )}
      title="Standard"
      aria-label="Standard"
      onClick={() => onChange({ ...value, [field]: DEFAULT_NAVIGATION[field] })}
    >
      <Icon name="reset" size={14} />
    </button>
  )
  return (
    <>
      <div className="keybinding-row">
        <span className="keybinding-label">Ansicht verschieben</span>
        <div className="keybinding-keys">
          <SettingsSegmented<PanKey>
            label="Ansicht verschieben"
            options={PAN_KEYS.map((key) => ({ value: key, label: PAN_KEY_LABELS[key] }))}
            value={value.panKey}
            onChange={(panKey) => onChange({ ...value, panKey })}
          />
        </div>
        {reset('panKey')}
      </div>
      <div className="keybinding-row">
        <span className="keybinding-label">Mittlere Maustaste</span>
        <div className="keybinding-keys">
          <label className="checkbox">
            <input
              type="checkbox"
              checked={value.panMiddleMouse}
              onChange={(e) => onChange({ ...value, panMiddleMouse: e.target.checked })}
            />
            Ansicht verschieben
          </label>
        </div>
        {reset('panMiddleMouse')}
      </div>
    </>
  )
}

import { formatCombo, type KeyAction, type Keybindings } from '@shared/keybindings'
import { useSettingsStore } from '@/store/settingsStore'

/** Tooltip mit dem ersten Kürzel aus den Einstellungen: „Speichern (Strg+S)“. */
export function shortcutTitle(label: string, bindings: Keybindings, action?: KeyAction): string {
  const combo = action && bindings[action][0]
  return combo ? `${label} (${formatCombo(combo)})` : label
}

export function useShortcutTitle(label: string, action: KeyAction): string {
  const bindings = useSettingsStore((s) => s.settings.keybindings)
  return shortcutTitle(label, bindings, action)
}

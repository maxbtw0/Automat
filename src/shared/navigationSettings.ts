/** Ansicht im Grapheneditor verschieben: Taste gedrückt halten und ziehen, mittlere Maustaste. */
export type PanKey = 'Ctrl' | 'Alt' | 'Space' | 'none'

export const PAN_KEYS: PanKey[] = ['Ctrl', 'Alt', 'Space', 'none']

export const PAN_KEY_LABELS: Record<PanKey, string> = {
  Ctrl: 'Strg',
  Alt: 'Alt',
  Space: 'Leertaste',
  none: 'Keine'
}

export interface NavigationSettings {
  panKey: PanKey
  panMiddleMouse: boolean
}

export const DEFAULT_NAVIGATION: NavigationSettings = { panKey: 'Ctrl', panMiddleMouse: true }

export function sameNavigation(a: NavigationSettings, b: NavigationSettings): boolean {
  return a.panKey === b.panKey && a.panMiddleMouse === b.panMiddleMouse
}

/** Aus der Einstellungsdatei – jedes ungültige Feld wird zum Standard. */
export function normalizeNavigation(raw: unknown): NavigationSettings {
  const r = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  const panKey = r['panKey']
  const panMiddleMouse = r['panMiddleMouse']
  return {
    panKey: PAN_KEYS.includes(panKey as PanKey) ? (panKey as PanKey) : DEFAULT_NAVIGATION.panKey,
    panMiddleMouse:
      typeof panMiddleMouse === 'boolean' ? panMiddleMouse : DEFAULT_NAVIGATION.panMiddleMouse
  }
}

/** Ist das die Verschiebe-Taste? (für keydown/keyup) */
export function isPanKey(panKey: PanKey, e: { key: string; code: string }): boolean {
  switch (panKey) {
    case 'Ctrl':
      return e.key === 'Control'
    case 'Alt':
      return e.key === 'Alt'
    case 'Space':
      return e.code === 'Space'
    case 'none':
      return false
  }
}

/**
 * Ist die Verschiebe-Taste bei einem Maus- oder Zeigerereignis gedrückt? Strg und Alt stehen im
 * Ereignis selbst, die Leertaste nicht – die verfolgt der Canvas über keydown/keyup.
 */
export function panModifierHeld(
  panKey: PanKey,
  e: { ctrlKey: boolean; altKey: boolean; metaKey: boolean }
): boolean {
  if (panKey === 'Ctrl') return e.ctrlKey || e.metaKey
  if (panKey === 'Alt') return e.altKey
  return false
}

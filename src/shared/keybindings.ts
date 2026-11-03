/**
 * Tastenkürzel: welche Aktionen es gibt, ihre Standardbelegung und die Textform einer
 * Tastenkombination („Ctrl+Shift+S“). Gemeinsam für Hauptprozess (Menü) und Renderer.
 *
 * Textform: Modifier in fester Reihenfolge Ctrl, Alt, Shift, dann genau eine Taste –
 * Buchstaben groß, sonst der Name aus `KeyboardEvent.key` (`Delete`, `ArrowLeft`, `F5`),
 * Leertaste = `Space`, Plus = `Plus`.
 */

/** Wo ein Kürzel wirkt: überall oder nur auf einem Screen. */
export type KeyScope = 'global' | 'graph' | 'simulation'

export const KEY_ACTION_IDS = [
  'file.new',
  'file.open',
  'file.save',
  'file.saveAs',
  'file.export',
  'edit.undo',
  'edit.redo',
  'edit.delete',
  'edit.selectAll',
  'edit.settings',
  'view.graph',
  'view.alphabet',
  'view.transitionTable',
  'view.regex',
  'view.simulation',
  'view.resetViewport',
  'tool.select',
  'tool.lasso',
  'tool.state',
  'tool.transition',
  'tool.delete',
  'tool.cancel',
  'sim.togglePlay',
  'sim.stepForward',
  'sim.stepBack',
  'sim.reset',
  'sim.runToEnd',
  'help.open'
] as const

export type KeyAction = (typeof KEY_ACTION_IDS)[number]

export interface KeyActionDefinition {
  label: string
  group: string
  scope: KeyScope
  defaults: string[]
  /** Wirkt auch in Eingabefeldern – aber nur mit Strg oder Alt */
  inTextFields?: boolean
}

export const KEY_ACTIONS: Record<KeyAction, KeyActionDefinition> = {
  'file.new': {
    label: 'Neu',
    group: 'Datei',
    scope: 'global',
    defaults: ['Ctrl+N'],
    inTextFields: true
  },
  'file.open': {
    label: 'Öffnen',
    group: 'Datei',
    scope: 'global',
    defaults: ['Ctrl+O'],
    inTextFields: true
  },
  'file.save': {
    label: 'Speichern',
    group: 'Datei',
    scope: 'global',
    defaults: ['Ctrl+S'],
    inTextFields: true
  },
  'file.saveAs': {
    label: 'Speichern unter',
    group: 'Datei',
    scope: 'global',
    defaults: ['Ctrl+Shift+S'],
    inTextFields: true
  },
  'file.export': {
    label: 'Exportieren',
    group: 'Datei',
    scope: 'global',
    defaults: ['Ctrl+E'],
    inTextFields: true
  },
  'edit.undo': { label: 'Rückgängig', group: 'Bearbeiten', scope: 'global', defaults: ['Ctrl+Z'] },
  'edit.redo': {
    label: 'Wiederholen',
    group: 'Bearbeiten',
    scope: 'global',
    defaults: ['Ctrl+Y', 'Ctrl+Shift+Z']
  },
  'edit.delete': {
    label: 'Auswahl löschen',
    group: 'Bearbeiten',
    scope: 'graph',
    defaults: ['Delete', 'Backspace']
  },
  'edit.selectAll': {
    label: 'Alles auswählen',
    group: 'Bearbeiten',
    scope: 'global',
    defaults: ['Ctrl+A']
  },
  'edit.settings': {
    label: 'Einstellungen',
    group: 'Bearbeiten',
    scope: 'global',
    defaults: ['Ctrl+,'],
    inTextFields: true
  },
  'view.graph': {
    label: 'Grapheneditor',
    group: 'Ansicht',
    scope: 'global',
    defaults: [],
    inTextFields: true
  },
  'view.alphabet': {
    label: 'Alphabeteditor',
    group: 'Ansicht',
    scope: 'global',
    defaults: [],
    inTextFields: true
  },
  'view.transitionTable': {
    label: 'Übergangstabelle',
    group: 'Ansicht',
    scope: 'global',
    defaults: [],
    inTextFields: true
  },
  'view.regex': {
    label: 'Reguläre Ausdrücke',
    group: 'Ansicht',
    scope: 'global',
    defaults: [],
    inTextFields: true
  },
  'view.simulation': {
    label: 'Simulation',
    group: 'Ansicht',
    scope: 'global',
    defaults: [],
    inTextFields: true
  },
  'view.resetViewport': {
    label: 'Ansicht zurücksetzen',
    group: 'Ansicht',
    scope: 'global',
    defaults: ['Ctrl+0']
  },
  'tool.select': { label: 'Auswählen', group: 'Grapheneditor', scope: 'graph', defaults: ['V'] },
  'tool.lasso': { label: 'Lasso', group: 'Grapheneditor', scope: 'graph', defaults: ['L'] },
  'tool.state': { label: 'Zustand', group: 'Grapheneditor', scope: 'graph', defaults: ['S'] },
  'tool.transition': { label: 'Übergang', group: 'Grapheneditor', scope: 'graph', defaults: ['A'] },
  'tool.delete': { label: 'Löschen', group: 'Grapheneditor', scope: 'graph', defaults: ['D'] },
  'tool.cancel': {
    label: 'Auswahl aufheben',
    group: 'Grapheneditor',
    scope: 'graph',
    defaults: ['Escape']
  },
  'sim.togglePlay': {
    label: 'Abspielen / Pause',
    group: 'Simulation',
    scope: 'simulation',
    defaults: ['Space']
  },
  'sim.stepForward': {
    label: 'Schritt',
    group: 'Simulation',
    scope: 'simulation',
    defaults: ['ArrowRight']
  },
  'sim.stepBack': {
    label: 'Schritt zurück',
    group: 'Simulation',
    scope: 'simulation',
    defaults: ['ArrowLeft']
  },
  'sim.reset': {
    label: 'Zurücksetzen',
    group: 'Simulation',
    scope: 'simulation',
    defaults: ['Home']
  },
  'sim.runToEnd': {
    label: 'Bis zum Ende',
    group: 'Simulation',
    scope: 'simulation',
    defaults: ['End']
  },
  'help.open': { label: 'Hilfe', group: 'Hilfe', scope: 'global', defaults: ['F1'] }
}

/** Belegung: pro Aktion beliebig viele Kombinationen (auch keine). */
export type Keybindings = Record<KeyAction, string[]>

export function defaultKeybindings(): Keybindings {
  return Object.fromEntries(
    KEY_ACTION_IDS.map((id) => [id, [...KEY_ACTIONS[id].defaults]])
  ) as Keybindings
}

const MODIFIERS = ['Ctrl', 'Alt', 'Shift'] as const
type Modifier = (typeof MODIFIERS)[number]

/** Tasten, die allein keine Kombination ergeben. */
const MODIFIER_KEYS = new Set([
  'Control',
  'Shift',
  'Alt',
  'AltGraph',
  'Meta',
  'OS',
  'CapsLock',
  'NumLock',
  'ScrollLock',
  'Fn',
  'Dead',
  'Process',
  'Unidentified'
])

function normalizeKey(key: string): string | null {
  if (key === '' || MODIFIER_KEYS.has(key)) return null
  if (key === ' ' || key === 'Spacebar') return 'Space'
  if (key === '+') return 'Plus'
  if (key === 'Esc') return 'Escape'
  if (key === 'Del') return 'Delete'
  if (key.length === 1) return key.toUpperCase()
  return key
}

function buildCombo(modifiers: Iterable<Modifier>, key: string): string {
  const set = new Set(modifiers)
  return [...MODIFIERS.filter((m) => set.has(m)), key].join('+')
}

/** Die Felder von `KeyboardEvent`, die eine Kombination ausmachen. */
export interface KeyEventLike {
  key: string
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  metaKey: boolean
}

/** Kombination eines Tastendrucks – `null` bei reinen Modifier-Tasten. */
export function comboFromEvent(e: KeyEventLike): string | null {
  const key = normalizeKey(e.key)
  if (!key) return null
  const modifiers: Modifier[] = []
  if (e.ctrlKey || e.metaKey) modifiers.push('Ctrl')
  if (e.altKey) modifiers.push('Alt')
  if (e.shiftKey) modifiers.push('Shift')
  return buildCombo(modifiers, key)
}

/** Liest eine Kombination aus Text („ctrl+shift+s“) – `null`, wenn sie ungültig ist. */
export function parseCombo(text: string): string | null {
  const trimmed = text.trim()
  // „+“ als Taste am Ende: „Ctrl++“
  const parts = trimmed.endsWith('++')
    ? [...trimmed.slice(0, -2).split('+'), '+']
    : trimmed === '+'
      ? ['+']
      : trimmed.split('+')
  const keyPart = parts.pop()?.trim() ?? ''
  const modifiers = new Set<Modifier>()
  for (const part of parts) {
    const modifier = MODIFIERS.find((m) => m.toLowerCase() === part.trim().toLowerCase())
    if (!modifier || modifiers.has(modifier)) return null
    modifiers.add(modifier)
  }
  const named = MODIFIERS.some((m) => m.toLowerCase() === keyPart.toLowerCase())
  const key = named ? null : normalizeKey(canonicalKeyName(keyPart))
  return key ? buildCombo(modifiers, key) : null
}

const NAMED_KEYS = [
  'Space',
  'Plus',
  'Enter',
  'Tab',
  'Escape',
  'Backspace',
  'Delete',
  'Insert',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown'
]

/** „delete“ → „Delete“, „f5“ → „F5“ – damit von Hand bearbeitete Dateien passen. */
function canonicalKeyName(key: string): string {
  if (key.length <= 1) return key
  const named = NAMED_KEYS.find((k) => k.toLowerCase() === key.toLowerCase())
  if (named) return named
  if (/^f\d{1,2}$/i.test(key)) return key.toUpperCase()
  return key
}

function splitCombo(combo: string): { modifiers: Modifier[]; key: string } {
  // „+“ als Taste heißt „Plus“ – das Trennzeichen ist also eindeutig
  const parts = combo.split('+')
  const key = parts.pop() ?? ''
  return { modifiers: parts as Modifier[], key }
}

export function hasModifier(combo: string): boolean {
  const { modifiers } = splitCombo(combo)
  return modifiers.includes('Ctrl') || modifiers.includes('Alt')
}

const KEY_LABELS: Record<string, string> = {
  Space: 'Leertaste',
  Plus: '+',
  Delete: 'Entf',
  Backspace: 'Rücktaste',
  Insert: 'Einfg',
  Home: 'Pos1',
  End: 'Ende',
  PageUp: 'Bild↑',
  PageDown: 'Bild↓',
  Escape: 'Esc',
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓'
}

const MODIFIER_LABELS: Record<Modifier, string> = { Ctrl: 'Strg', Alt: 'Alt', Shift: 'Umschalt' }

/** Anzeige auf Deutsch: „Strg+Umschalt+S“, „Entf“, „←“. */
export function formatCombo(combo: string): string {
  const { modifiers, key } = splitCombo(combo)
  return [...modifiers.map((m) => MODIFIER_LABELS[m]), KEY_LABELS[key] ?? key].join('+')
}

const ACCELERATOR_KEYS: Record<string, string> = {
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  Escape: 'Esc'
}

/** Electron-Accelerator fürs Menü – `null`, wenn Electron die Taste nicht kennt. */
export function toAccelerator(combo: string): string | null {
  const { modifiers, key } = splitCombo(combo)
  const name =
    ACCELERATOR_KEYS[key] ??
    (NAMED_KEYS.includes(key) || /^F\d{1,2}$/.test(key) || /^[!-~]$/.test(key) ? key : null)
  if (!name) return null
  return [...modifiers.map((m) => (m === 'Ctrl' ? 'CmdOrCtrl' : m)), name].join('+')
}

function scopesOverlap(a: KeyScope, b: KeyScope): boolean {
  return a === 'global' || b === 'global' || a === b
}

/** Aktion, die `combo` schon belegt und sich mit `action` in die Quere käme. */
export function findConflict(
  bindings: Keybindings,
  action: KeyAction,
  combo: string
): KeyAction | null {
  const scope = KEY_ACTIONS[action].scope
  return (
    KEY_ACTION_IDS.find(
      (other) =>
        other !== action &&
        scopesOverlap(scope, KEY_ACTIONS[other].scope) &&
        bindings[other].includes(combo)
    ) ?? null
  )
}

/** Welche Aktion `combo` auf einem Screen mit Bereich `scope` auslöst. */
export function actionForCombo(
  bindings: Keybindings,
  combo: string,
  scope: KeyScope
): KeyAction | null {
  return (
    KEY_ACTION_IDS.find(
      (id) =>
        (KEY_ACTIONS[id].scope === 'global' || KEY_ACTIONS[id].scope === scope) &&
        bindings[id].includes(combo)
    ) ?? null
  )
}

/**
 * Belegung aus der Einstellungsdatei: unbekannte Aktionen und ungültige Kombinationen fallen
 * weg, fehlende Aktionen bekommen ihre Standardbelegung.
 */
export function normalizeKeybindings(raw: unknown): Keybindings {
  const bindings = defaultKeybindings()
  if (typeof raw !== 'object' || raw === null) return bindings
  const record = raw as Record<string, unknown>
  for (const id of KEY_ACTION_IDS) {
    const value = record[id]
    if (!Array.isArray(value)) continue
    const combos = value
      .map((text) => (typeof text === 'string' ? parseCombo(text) : null))
      .filter((combo): combo is string => combo !== null)
    bindings[id] = [...new Set(combos)]
  }
  return bindings
}

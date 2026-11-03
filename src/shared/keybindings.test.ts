import { describe, expect, it } from 'vitest'
import {
  KEY_ACTION_IDS,
  KEY_ACTIONS,
  actionForCombo,
  comboFromEvent,
  defaultKeybindings,
  findConflict,
  formatCombo,
  normalizeKeybindings,
  parseCombo,
  toAccelerator
} from './keybindings'
import { defaultSettings, normalizeSettings, serializeSettings } from './settings'

const press = (key: string, mods: Partial<Record<'ctrl' | 'alt' | 'shift' | 'meta', boolean>> = {}) =>
  comboFromEvent({
    key,
    ctrlKey: mods.ctrl ?? false,
    altKey: mods.alt ?? false,
    shiftKey: mods.shift ?? false,
    metaKey: mods.meta ?? false
  })

describe('Tastenkürzel', () => {
  it('liest Kombinationen aus Tastendrücken', () => {
    expect(press('s', { ctrl: true })).toBe('Ctrl+S')
    expect(press('S', { ctrl: true, shift: true })).toBe('Ctrl+Shift+S')
    expect(press('s', { meta: true })).toBe('Ctrl+S')
    expect(press(' ')).toBe('Space')
    expect(press('+', { ctrl: true })).toBe('Ctrl+Plus')
    expect(press('ArrowLeft', { alt: true, shift: true })).toBe('Alt+Shift+ArrowLeft')
    expect(press('Control', { ctrl: true })).toBeNull()
    expect(press('Shift', { shift: true })).toBeNull()
  })

  it('liest Kombinationen aus Text in fester Reihenfolge', () => {
    expect(parseCombo('shift+ctrl+s')).toBe('Ctrl+Shift+S')
    expect(parseCombo(' delete ')).toBe('Delete')
    expect(parseCombo('f5')).toBe('F5')
    expect(parseCombo('Ctrl++')).toBe('Ctrl+Plus')
    expect(parseCombo('Ctrl+,')).toBe('Ctrl+,')
    expect(parseCombo('Ctrl+Ctrl+S')).toBeNull()
    expect(parseCombo('Hyper+S')).toBeNull()
    expect(parseCombo('Ctrl+')).toBeNull()
    expect(parseCombo('Ctrl+Shift')).toBeNull()
  })

  it('alle Standardkürzel sind gültig und überschneiden sich nicht', () => {
    const bindings = defaultKeybindings()
    for (const id of KEY_ACTION_IDS) {
      for (const combo of KEY_ACTIONS[id].defaults) {
        expect(parseCombo(combo)).toBe(combo)
        expect(findConflict(bindings, id, combo)).toBeNull()
      }
    }
  })

  it('zeigt Kombinationen auf Deutsch', () => {
    expect(formatCombo('Ctrl+Shift+S')).toBe('Strg+Umschalt+S')
    expect(formatCombo('Delete')).toBe('Entf')
    expect(formatCombo('Home')).toBe('Pos1')
    expect(formatCombo('Space')).toBe('Leertaste')
    expect(formatCombo('Ctrl+Plus')).toBe('Strg++')
    expect(formatCombo('ArrowRight')).toBe('→')
  })

  it('übersetzt in Electron-Accelerators', () => {
    expect(toAccelerator('Ctrl+Shift+S')).toBe('CmdOrCtrl+Shift+S')
    expect(toAccelerator('Delete')).toBe('Delete')
    expect(toAccelerator('Alt+ArrowLeft')).toBe('Alt+Left')
    expect(toAccelerator('Escape')).toBe('Esc')
    expect(toAccelerator('Ctrl+,')).toBe('CmdOrCtrl+,')
    expect(toAccelerator('F12')).toBe('F12')
    expect(toAccelerator('Ctrl+Ö')).toBeNull()
    expect(toAccelerator('MediaPlayPause')).toBeNull()
  })

  it('findet Doppelbelegungen nur, wo sich die Bereiche überschneiden', () => {
    const bindings = defaultKeybindings()
    // global gegen Grapheneditor
    expect(findConflict(bindings, 'file.save', 'S')).toBe('tool.state')
    // Grapheneditor gegen Simulation: verschiedene Screens
    expect(findConflict(bindings, 'tool.select', 'Space')).toBeNull()
    expect(findConflict(bindings, 'sim.reset', 'V')).toBeNull()
    // die eigene Belegung zählt nicht
    expect(findConflict(bindings, 'file.save', 'Ctrl+S')).toBeNull()
  })

  it('löst je nach Screen die passende Aktion aus', () => {
    const bindings = defaultKeybindings()
    expect(actionForCombo(bindings, 'Ctrl+S', 'graph')).toBe('file.save')
    expect(actionForCombo(bindings, 'Ctrl+S', 'global')).toBe('file.save')
    expect(actionForCombo(bindings, 'S', 'graph')).toBe('tool.state')
    expect(actionForCombo(bindings, 'S', 'simulation')).toBeNull()
    expect(actionForCombo(bindings, 'Space', 'simulation')).toBe('sim.togglePlay')
    expect(actionForCombo(bindings, 'V', 'global')).toBeNull()
  })

  it('übernimmt gültige Belegungen aus der Datei und ergänzt fehlende', () => {
    const bindings = normalizeKeybindings({
      'file.save': ['ctrl+shift+w', 'Unsinn+X', 42, 'Ctrl+Shift+W'],
      'view.graph': ['Alt+1'],
      'tool.state': [],
      'gibt.esnicht': ['Ctrl+Q']
    })
    expect(bindings['file.save']).toEqual(['Ctrl+Shift+W'])
    expect(bindings['view.graph']).toEqual(['Alt+1'])
    expect(bindings['tool.state']).toEqual([])
    expect(bindings['file.open']).toEqual(['Ctrl+O'])
    expect(Object.keys(bindings)).toEqual([...KEY_ACTION_IDS])
  })
})

describe('Einstellungen', () => {
  it('kaputte oder fehlende Daten werden zum Standard', () => {
    expect(normalizeSettings(null)).toEqual(defaultSettings())
    expect(normalizeSettings('Unsinn')).toEqual(defaultSettings())
    expect(normalizeSettings({ keybindings: 'Unsinn' })).toEqual(defaultSettings())
  })

  it('übersteht Speichern und Laden', () => {
    const settings = defaultSettings()
    settings.keybindings['view.simulation'] = ['F5']
    settings.alphabetPresets = [{ name: 'Mein', symbols: ['x', 'y'] }]
    const text = serializeSettings(settings)
    expect(JSON.parse(text).version).toBe(1)
    expect(normalizeSettings(JSON.parse(text))).toEqual(settings)
  })
})

import {
  defaultAlphabetPresets,
  normalizeAlphabetPresets,
  presetsValid,
  type AlphabetPreset
} from './alphabetPresets'
import { defaultKeybindings, normalizeKeybindings, type Keybindings } from './keybindings'
import {
  DEFAULT_NEW_AUTOMATON,
  newAutomatonProblems,
  normalizeNewAutomaton,
  presetSymbols,
  type NewAutomatonSettings
} from './newAutomaton'
import {
  DEFAULT_NAVIGATION,
  normalizeNavigation,
  type NavigationSettings
} from './navigationSettings'
import {
  DEFAULT_SIMULATION,
  normalizeSimulation,
  type SimulationSettings
} from './simulationSettings'

/**
 * Einstellungen des Programms. Der Hauptprozess speichert sie als JSON unter
 * `%APPDATA%/maxbtw0/automat/settings.json`, im Browser liegen sie im localStorage.
 */
export interface Settings {
  keybindings: Keybindings
  alphabetPresets: AlphabetPreset[]
  newAutomaton: NewAutomatonSettings
  simulation: SimulationSettings
  /** Grapheneditor: Ansicht verschieben */
  navigation: NavigationSettings
}

/** Bei Strukturänderungen erhöhen und in `normalizeSettings` migrieren. */
export const SETTINGS_VERSION = 1

export function defaultSettings(): Settings {
  return {
    keybindings: defaultKeybindings(),
    alphabetPresets: defaultAlphabetPresets(),
    newAutomaton: { ...DEFAULT_NEW_AUTOMATON },
    simulation: { ...DEFAULT_SIMULATION },
    navigation: { ...DEFAULT_NAVIGATION }
  }
}

/** Liest Einstellungen aus beliebigem JSON – Fehlendes oder Ungültiges wird zum Standard. */
export function normalizeSettings(raw: unknown): Settings {
  const record = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  return {
    keybindings: normalizeKeybindings(record['keybindings']),
    alphabetPresets: normalizeAlphabetPresets(record['alphabetPresets']),
    newAutomaton: normalizeNewAutomaton(record['newAutomaton']),
    simulation: normalizeSimulation(record['simulation']),
    navigation: normalizeNavigation(record['navigation'])
  }
}

export function serializeSettings(settings: Settings): string {
  return `${JSON.stringify({ version: SETTINGS_VERSION, ...settings }, null, 2)}\n`
}

export function sameSettings(a: Settings, b: Settings): boolean {
  return serializeSettings(a) === serializeSettings(b)
}

/** Lässt sich der Entwurf speichern? Die Reiter zeigen Probleme rot an. */
export function settingsValid(settings: Settings): boolean {
  const problems = newAutomatonProblems(settings.newAutomaton, settings.alphabetPresets)
  return presetsValid(settings.alphabetPresets) && Object.keys(problems).length === 0
}

/** Alphabet für „Neu“ aus der gewählten Voreinstellung */
export function newAutomatonAlphabet(settings: Settings): string[] {
  return presetSymbols(settings.newAutomaton, settings.alphabetPresets)
}

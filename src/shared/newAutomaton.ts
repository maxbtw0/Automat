import type { AlphabetPreset } from './alphabetPresets'
import {
  AUTOMATON_TYPES,
  TAPE_MOVES,
  type AutomatonType,
  type StackAcceptance,
  type TapeMove
} from './automatonTypes'

/** Vorgaben für „Neu“ – und für Stack/Band, die beim Typwechsel neu entstehen. */
export interface NewAutomatonSettings {
  type: AutomatonType
  /** Name einer Alphabet-Voreinstellung, `''` = leeres Alphabet */
  alphabetPreset: string
  /** Zustandsnamen: Präfix + Nummer, z. B. q0, q1 oder z0, z1 */
  statePrefix: string
  /** Kellerautomat: Startsymbol (Stackboden) */
  stackStart: string
  acceptance: StackAcceptance
  /** Turingmaschine: Blank */
  blank: string
  /** Turingmaschine: Bewegung neuer Regeln */
  tapeMove: TapeMove
}

export const DEFAULT_NEW_AUTOMATON: NewAutomatonSettings = {
  type: 'DFA',
  alphabetPreset: '',
  statePrefix: 'q',
  stackStart: '#',
  acceptance: 'final',
  blank: '#',
  tapeMove: 'N'
}

const EPSILON_SPELLINGS = new Set(['ε', 'eps', 'epsilon'])

/** Problem eines einzelnen Symbols (Startsymbol, Blank) – kurz, `null` wenn es passt. */
export function singleSymbolProblem(symbol: string): string | null {
  if (symbol === '') return 'Symbol fehlt'
  if (/[,;\s]/.test(symbol)) return 'Kein Leerzeichen, Komma oder Semikolon'
  if (EPSILON_SPELLINGS.has(symbol.toLowerCase())) return 'ε ist kein Symbol'
  if (/[→/]/.test(symbol)) return '→ und / nicht erlaubt'
  return null
}

export function statePrefixProblem(prefix: string): string | null {
  if (prefix === '') return 'Präfix fehlt'
  if (/[,;\s]/.test(prefix)) return 'Kein Leerzeichen, Komma oder Semikolon'
  if (prefix.length > 8) return 'Höchstens 8 Zeichen'
  return null
}

/** Symbole der gewählten Voreinstellung – leer, wenn keine gewählt ist oder es sie nicht gibt. */
export function presetSymbols(settings: NewAutomatonSettings, presets: AlphabetPreset[]): string[] {
  return presets.find((p) => p.name === settings.alphabetPreset)?.symbols ?? []
}

export type NewAutomatonProblems = Partial<Record<keyof NewAutomatonSettings, string>>

/** Probleme je Feld – leer, wenn alles passt. */
export function newAutomatonProblems(
  settings: NewAutomatonSettings,
  presets: AlphabetPreset[]
): NewAutomatonProblems {
  const problems: NewAutomatonProblems = {}
  const prefix = statePrefixProblem(settings.statePrefix)
  if (prefix) problems.statePrefix = prefix
  const stack = singleSymbolProblem(settings.stackStart)
  if (stack) problems.stackStart = stack
  const blank = singleSymbolProblem(settings.blank)
  if (blank) problems.blank = blank
  else if (presetSymbols(settings, presets).includes(settings.blank)) {
    problems.blank = `„${settings.blank}“ ist im Alphabet`
  }
  return problems
}

function pick<T>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

function text(value: unknown, problem: (v: string) => string | null, fallback: string): string {
  return typeof value === 'string' && problem(value.trim()) === null ? value.trim() : fallback
}

/** Vorgaben aus der Einstellungsdatei – jedes ungültige Feld wird zum Standard. */
export function normalizeNewAutomaton(raw: unknown): NewAutomatonSettings {
  const r = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  const d = DEFAULT_NEW_AUTOMATON
  const preset = r['alphabetPreset']
  return {
    type: pick(r['type'], AUTOMATON_TYPES, d.type),
    alphabetPreset: typeof preset === 'string' ? preset.trim() : d.alphabetPreset,
    statePrefix: text(r['statePrefix'], statePrefixProblem, d.statePrefix),
    stackStart: text(r['stackStart'], singleSymbolProblem, d.stackStart),
    acceptance: pick<StackAcceptance>(r['acceptance'], ['final', 'empty'], d.acceptance),
    blank: text(r['blank'], singleSymbolProblem, d.blank),
    tapeMove: pick(r['tapeMove'], TAPE_MOVES, d.tapeMove)
  }
}

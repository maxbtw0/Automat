/**
 * Voreinstellungen für das Alphabet – erscheinen im Alphabeteditor unter „Voreinstellung“ und
 * lassen sich in den Einstellungen (Reiter „Alphabete“) bearbeiten. Die Liste hier ist der
 * Standard, wenn die Einstellungsdatei noch keine hat.
 */

export interface AlphabetPreset {
  /** Anzeigename im Menü */
  name: string
  symbols: string[]
}

export const DEFAULT_ALPHABET_PRESETS: AlphabetPreset[] = [
  { name: 'a, b', symbols: ['a', 'b'] },
  { name: 'a, b, c', symbols: ['a', 'b', 'c'] },
  { name: 'Binär {0, 1}', symbols: ['0', '1'] },
  { name: 'Ziffern 0–9', symbols: [...'0123456789'] },
  { name: 'Kleinbuchstaben a–z', symbols: [...'abcdefghijklmnopqrstuvwxyz'] },
  { name: 'Großbuchstaben A–Z', symbols: [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'] },
  { name: 'runde Klammern (, ) ', symbols: ['(', ')'] },
  { name: 'alle Klammern [, ]', symbols: ['(', ')', '[', ']', '{', '}'] }
]

export function defaultAlphabetPresets(): AlphabetPreset[] {
  // Namen getrimmt wie beim Laden – sonst gälte die Liste nach dem Speichern als geändert.
  return DEFAULT_ALPHABET_PRESETS.map((p) => ({ name: p.name.trim(), symbols: [...p.symbols] }))
}

/** ε und seine Schreibweisen – das leere Wort ist kein Symbol (wie `normalizeSymbol`). */
const EPSILON_SPELLINGS = new Set(['ε', 'eps', 'epsilon'])

/** „a, b c;d“ → ["a", "b", "c", "d"] – Trennzeichen wie im Alphabeteditor. */
export function splitPresetSymbols(text: string): string[] {
  return text.split(/[,;\s]+/).filter(Boolean)
}

export function formatPresetSymbols(symbols: string[]): string {
  return symbols.join(', ')
}

/** Problem eines Symbols – `null`, wenn es passt. */
function symbolProblem(symbol: string, before: string[]): string | null {
  if (EPSILON_SPELLINGS.has(symbol.toLowerCase())) return 'ε ist kein Symbol'
  if (before.includes(symbol)) return `„${symbol}“ doppelt`
  return null
}

/** Problem eines Presets in einer Liste – kurz, für die rote Zeile; `null`, wenn es passt. */
export function presetProblem(presets: AlphabetPreset[], index: number): string | null {
  const { name, symbols } = presets[index]
  if (name.trim() === '') return 'Name fehlt'
  if (presets.some((p, i) => i < index && p.name.trim() === name.trim())) {
    return `„${name.trim()}“ doppelt`
  }
  if (symbols.length === 0) return 'Keine Symbole'
  for (let i = 0; i < symbols.length; i++) {
    const problem = symbolProblem(symbols[i], symbols.slice(0, i))
    if (problem) return problem
  }
  return null
}

export function presetsValid(presets: AlphabetPreset[]): boolean {
  return presets.every((_, i) => presetProblem(presets, i) === null)
}

/**
 * Presets aus der Einstellungsdatei: fehlt die Liste, gilt der Standard; ungültige Einträge
 * (kein Name, doppelter Name, keine gültigen Symbole) fallen weg.
 */
export function normalizeAlphabetPresets(raw: unknown): AlphabetPreset[] {
  if (!Array.isArray(raw)) return defaultAlphabetPresets()
  const presets: AlphabetPreset[] = []
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue
    const { name, symbols } = item as Record<string, unknown>
    if (typeof name !== 'string' || !Array.isArray(symbols)) continue
    const valid: string[] = []
    for (const symbol of symbols) {
      if (typeof symbol !== 'string') continue
      const parts = splitPresetSymbols(symbol)
      if (parts.length === 1 && !symbolProblem(parts[0], valid)) valid.push(parts[0])
    }
    const preset = { name: name.trim(), symbols: valid }
    if (presetProblem([...presets, preset], presets.length) === null) presets.push(preset)
  }
  return presets
}

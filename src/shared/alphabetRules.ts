/**
 * Leerraum, Komma und Semikolon trennen Symbole (Alphabet-Eingabe, Beschriftungen, Wörter) –
 * in einem Symbol wären sie mehrdeutig.
 */
export const SYMBOL_SEPARATOR = /[,;\s]/

/** Problem eines Symbols mit Trennzeichen: „„a b“ mit Leerzeichen, Komma oder Semikolon“ */
export function separatorProblem(symbol: string): string | null {
  return SYMBOL_SEPARATOR.test(symbol)
    ? `„${symbol}“ mit Leerzeichen, Komma oder Semikolon`
    : null
}

/**
 * Ein Zeichen darf nicht einzeln im Alphabet liegen und zugleich in einem Symbol mit mehreren
 * Zeichen vorkommen. Sonst ist ein Wort mehrdeutig: Bei Σ = {a, b, ab} kann „ab“ das eine
 * Symbol ab oder die Folge a, b sein.
 *
 * Liefert das Problem, wenn `symbol` zu `alphabet` dazukäme – sonst `null`.
 */
export function overlapProblem(alphabet: string[], symbol: string): string | null {
  const chars = [...symbol]
  if (chars.length > 1) {
    const single = chars.find((c) => alphabet.includes(c))
    return single === undefined ? null : `„${single}“ gibt es schon einzeln`
  }
  const longer = alphabet.find((s) => [...s].length > 1 && s.includes(symbol))
  return longer === undefined ? null : `„${symbol}“ steckt in „${longer}“`
}

/** Problem eines ganzen Alphabets: „„a“ einzeln und in „ab““ – sonst `null`. */
export function alphabetOverlap(alphabet: string[]): string | null {
  for (const longer of alphabet) {
    if ([...longer].length < 2) continue
    const single = [...longer].find((c) => alphabet.includes(c))
    if (single !== undefined) return `„${single}“ einzeln und in „${longer}“`
  }
  return null
}

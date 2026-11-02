/**
 * Zerlegt ein Eingabewort in Symbole aus Σ.
 *
 * Leerzeichen trennen Symbole: Bei Σ = {a, b, ab} ist „a b“ = [a, b] und „ab“ = [ab]. Symbole
 * enthalten nie Leerzeichen (`validateSymbol`), so lässt sich jede Symbolfolge eingeben.
 *
 * Innerhalb eines Stücks ohne Leerzeichen dürfen Symbole mehrere Zeichen haben (z. B. „x1“),
 * deshalb wird an jeder Stelle das längste passende Symbol genommen. Passt keins, wird ein
 * einzelnes Zeichen gelesen (ein ganzer Unicode-Codepoint, auch ein Emoji) – das liegt dann
 * nicht in Σ, es gibt keinen Übergang dafür und der Automat verwirft.
 */
export function tokenizeWord(word: string, alphabet: string[]): string[] {
  // Ein leeres Symbol passt überall, ohne voranzukommen – es würde endlos lesen
  const byLength = alphabet.filter((s) => s !== '').sort((a, b) => b.length - a.length)
  const tokens: string[] = []
  for (const part of word.split(/\s+/)) {
    let i = 0
    while (i < part.length) {
      const symbol =
        byLength.find((s) => part.startsWith(s, i)) ?? String.fromCodePoint(part.codePointAt(i)!)
      tokens.push(symbol)
      i += symbol.length
    }
  }
  return tokens
}

/**
 * Symbole wieder als Text, leer = „“. Ohne Trennzeichen („abba“), solange `tokenizeWord` daraus
 * dieselben Symbole liest – sonst und bei Mehrzeichen-Symbolen mit Leerzeichen („a b“, „x1 x2“).
 */
export function joinWord(symbols: string[], alphabet?: string[]): string {
  if (symbols.some((s) => s.length > 1)) return symbols.join(' ')
  const joined = symbols.join('')
  if (alphabet && !sameSymbols(tokenizeWord(joined, alphabet), symbols)) return symbols.join(' ')
  return joined
}

const sameSymbols = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((s, i) => s === b[i])

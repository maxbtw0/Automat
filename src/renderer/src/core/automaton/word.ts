/**
 * Zerlegt ein Eingabewort in Symbole aus Σ.
 *
 * Symbole dürfen mehrere Zeichen haben (z. B. „x1“), deshalb wird an jeder Stelle das längste
 * passende Symbol genommen. Passt keins, wird ein einzelnes Zeichen gelesen – das liegt dann
 * nicht in Σ, es gibt keinen Übergang dafür und der Automat verwirft.
 */
export function tokenizeWord(word: string, alphabet: string[]): string[] {
  // Ein leeres Symbol passt überall, ohne voranzukommen – es würde endlos lesen
  const byLength = alphabet.filter((s) => s !== '').sort((a, b) => b.length - a.length)
  const tokens: string[] = []
  let i = 0
  while (i < word.length) {
    const symbol = byLength.find((s) => word.startsWith(s, i)) ?? word[i]
    tokens.push(symbol)
    i += symbol.length
  }
  return tokens
}

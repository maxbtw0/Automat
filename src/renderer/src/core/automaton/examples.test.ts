import { describe, expect, it } from 'vitest'
import { deserializeDocument } from '@/model/serialization'
import palindromes from '../../../../../beispiele/palindrome-kellerautomat.json?raw'
import anbncn from '../../../../../beispiele/anbncn-turingmaschine.json?raw'
import { createAutomaton } from './registry'
import { allWords } from './testing'

/** Beispieldateien im Ordner `beispiele/` – sie müssen laden und das Versprochene erkennen. */
describe('Beispiele', () => {
  it('palindrome-kellerautomat.json erkennt genau die Palindrome über {a, b}', () => {
    const automaton = createAutomaton(deserializeDocument(palindromes))
    expect(automaton.validate().filter((i) => i.severity === 'error')).toEqual([])
    for (const w of allWords(['a', 'b'], 7)) {
      expect(automaton.accepts(w), w).toBe(w === [...w].reverse().join(''))
    }
  })

  it('anbncn-turingmaschine.json erkennt genau aⁿbⁿcⁿ', () => {
    const automaton = createAutomaton(deserializeDocument(anbncn))
    expect(automaton.validate().filter((i) => i.severity !== 'info')).toEqual([])
    for (const w of allWords(['a', 'b', 'c'], 6)) {
      const n = w.length / 3
      expect(automaton.accepts(w), w).toBe(w === 'a'.repeat(n) + 'b'.repeat(n) + 'c'.repeat(n))
    }
  })
})

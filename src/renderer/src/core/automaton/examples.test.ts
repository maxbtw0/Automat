import { describe, expect, it } from 'vitest'
import { deserializeDocument } from '@/model/serialization'
import palindromes from '../../../../../beispiele/palindrome-kellerautomat.json?raw'
import anbncn from '../../../../../beispiele/anbncn-turingmaschine.json?raw'
import edges from '../../../../../beispiele/flankenerkennung-mealy.json?raw'
import mod3 from '../../../../../beispiele/rest-modulo-3-moore.json?raw'
import { createAutomaton } from './registry'
import type { Transducer } from './transducer'
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

  it('flankenerkennung-mealy.json gibt 1 aus, wo sich das Bit ändert', () => {
    const automaton = createAutomaton(deserializeDocument(edges)) as Transducer
    expect(automaton.validate().filter((i) => i.severity !== 'info')).toEqual([])
    for (const w of allWords(['0', '1'], 7)) {
      const expected = [...w].map((c, i) => (i > 0 && c !== w[i - 1] ? '1' : '0')).join('')
      expect(automaton.translate(w)?.join(''), w).toBe(expected)
    }
  })

  it('rest-modulo-3-moore.json gibt nach jedem Bit den Rest der Binärzahl modulo 3 aus', () => {
    const automaton = createAutomaton(deserializeDocument(mod3)) as Transducer
    expect(automaton.validate().filter((i) => i.severity !== 'info')).toEqual([])
    for (const w of allWords(['0', '1'], 7)) {
      const rests = [...w].map((_, i) => String(parseInt(w.slice(0, i + 1), 2) % 3))
      expect(automaton.translate(w)?.join(''), w).toBe(['0', ...rests].join(''))
    }
  })
})

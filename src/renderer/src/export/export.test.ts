import { describe, expect, it } from 'vitest'
import { DFA } from '@/core/automaton/dfa'
import { createAutomaton } from '@/core/automaton/registry'
import { buildDocument } from '@/core/automaton/testing'
import { pdfHtml, svgDataUrl } from './render'
import {
  A4,
  MONO,
  PALETTES,
  SERIF,
  captionSvg,
  columnSvg,
  graphSvg,
  measureText,
  outputFigureSvg,
  pageSvg,
  paragraphSvg,
  rowSvg,
  stackFigureSvg,
  tableSvg,
  tapeFigureSvg
} from './svg'
import {
  alphabetTable,
  paginateTable,
  simulationTable,
  tableToCsv,
  transitionTable,
  type SimulationSnapshot
} from './tables'

const evenAs = buildDocument('DFA', ['a', 'b'], { start: 'q0', finals: ['q0'] }, [
  ['q0', 'a', 'q1'],
  ['q1', 'a', 'q0'],
  ['q1', 'b', 'q1'],
  ['q0', 'b', 'q0']
])

describe('Tabellen', () => {
  it('Alphabet mit Anzahl der Übergänge', () => {
    expect(alphabetTable(evenAs).rows).toEqual([
      ['1', 'a', '2'],
      ['2', 'b', '2']
    ])
  })

  it('Übergangstabelle in Dokument- oder sortierter Reihenfolge', () => {
    const plain = transitionTable(evenAs, false).rows.map((r) => r.slice(1).join(' '))
    expect(plain).toEqual(['q0 a q1', 'q1 a q0', 'q1 b q1', 'q0 b q0'])
    const sorted = transitionTable(evenAs, true).rows.map((r) => r.slice(1).join(' '))
    expect(sorted).toEqual(['q0 a q1', 'q0 b q0', 'q1 a q0', 'q1 b q1'])
  })

  it('Simulationstabelle färbt die letzte Zeile nach dem Ergebnis', () => {
    const sim = new DFA(evenAs).createSimulator('ab')
    const steps = [sim.reset(), ...sim.run().steps]
    const snapshot: SimulationSnapshot = { word: 'ab', steps, index: 0, outcome: 'rejected' }
    const table = simulationTable(evenAs, snapshot, { markCurrent: true })
    expect(table.rows).toEqual([
      ['0', '–', 'q0', 'ab'],
      ['1', 'a', 'q1', 'b'],
      ['2', 'b', 'q1', 'ε']
    ])
    expect(table.rowTones).toEqual(['current', undefined, 'rejected'])
  })

  it('paginateTable teilt lange Tabellen, Titel nur auf Seite 1', () => {
    const table = { title: 'T', columns: [{ title: 'x' }], rows: [['1'], ['2'], ['3']] }
    const pages = paginateTable(table, 2)
    expect(pages.map((p) => [p.title, p.rows.length])).toEqual([
      ['T', 2],
      [undefined, 1]
    ])
  })
})

describe('tableToCsv', () => {
  it('Semikolon, CRLF, BOM und Anführungszeichen bei Bedarf', () => {
    const csv = tableToCsv({
      columns: [{ title: 'A' }, { title: 'B' }],
      rows: [
        ['x;y', 'sagt "hi"'],
        ['ε', ' leer']
      ]
    })
    expect(csv).toBe('﻿A;B\r\n"x;y";"sagt ""hi"""\r\nε;" leer"\r\n')
  })
})

describe('SVG', () => {
  it('Graph enthält alle Zustände und escapt Sonderzeichen', () => {
    const doc = buildDocument('DFA', ['<'], { start: 'q<0>', finals: ['q&1'] }, [
      ['q<0>', '<', 'q&1']
    ])
    const { svg, width, height } = graphSvg(doc)
    expect(svg).toContain('q&lt;0&gt;')
    expect(svg).toContain('q&amp;1')
    expect(svg).not.toContain('q<0>')
    expect(width).toBeGreaterThan(0)
    expect(height).toBeGreaterThan(0)
  })

  it('columnSvg addiert die Höhen und nimmt die größte Breite', () => {
    const a = tableSvg({ columns: [{ title: 'kurz' }], rows: [] })
    const b = tableSvg({ columns: [{ title: 'eine viel längere Überschrift' }], rows: [['1']] })
    const stacked = columnSvg([a, b], 10)
    expect(stacked.width).toBe(Math.max(a.width, b.width))
    expect(stacked.height).toBe(a.height + b.height + 10)
  })
})

describe('Farbmodus und Untertitel', () => {
  it('Tabelle zeigt den Namen des Automaten unter dem Titel', () => {
    const { svg } = tableSvg({ ...alphabetTable(evenAs), subtitle: 'gerade-as' })
    expect(svg).toContain('>Alphabet</text>')
    expect(svg).toContain('>gerade-as</text>')
  })

  it('dunkle Palette färbt den Hintergrund', () => {
    const image = graphSvg(evenAs, null, { palette: PALETTES.dark })
    expect(image.background).toBe(PALETTES.dark.background)
    expect(image.svg).toContain(`fill="${PALETTES.dark.background}"`)
    expect(columnSvg([image, image]).background).toBe(PALETTES.dark.background)
  })
})

describe('Export Kellerautomat', () => {
  const pda = buildDocument('DPDA', ['a', 'b'], { start: 'q0', finals: ['q2'], stack: ['A', '#'] }, [
    ['q0', 'a, # → A#; a, A → AA', 'q0'],
    ['q0', 'b, A → ε', 'q1'],
    ['q1', 'ε, # → #', 'q2']
  ])

  it('Übergangstabelle mit Stacksymbol und Push', () => {
    const table = transitionTable(pda, false)
    expect(table.columns.map((c) => c.title)).toEqual([
      '#',
      'Zustand',
      'Eingabe',
      'Top of Stack',
      'Push',
      'Folgezustand'
    ])
    expect(table.rows[0]).toEqual(['1', 'q0', 'a', '#', 'A#', 'q0'])
    expect(table.rows[2]).toEqual(['3', 'q0', 'b', 'A', 'ε', 'q1'])
  })

  it('Alphabet mit Σ und Γ', () => {
    expect(alphabetTable(pda).rows).toEqual([
      ['1', 'Σ', 'a', '', '1'],
      ['2', 'Σ', 'b', '', '1'],
      ['3', 'Γ', 'A', '', '2'],
      ['4', 'Γ', '#', 'Start', '2']
    ])
  })

  it('Simulationstabelle mit Regel und Stack', () => {
    const sim = createAutomaton(pda).createSimulator('ab')
    const steps = [sim.reset(), ...sim.run().steps]
    const table = simulationTable(pda, { word: 'ab', steps, index: 0, outcome: 'accepted' })
    expect(table.rows.map((r) => [r[1], r[4]])).toEqual([
      ['–', '#'],
      ['a, # → A#', 'A#'],
      ['b, A → ε', '#'],
      ['ε, # → #', '#']
    ])
  })

  it('Graph: eine Zeile pro Stackregel', () => {
    const { svg } = graphSvg(pda)
    expect(svg).toContain('>a, # → A#</tspan>')
    expect(svg).toContain('>a, A → AA</tspan>')
  })
})

describe('Stack im Export', () => {
  it('zeichnet die Symbole von unten nach oben, das oberste hervorgehoben', () => {
    const { svg } = stackFigureSvg(['#', 'A'])
    expect(svg).toContain('>Stack</text>')
    // Boden zuerst gezeichnet, oberstes Symbol in Akzentfarbe
    expect(svg.indexOf('>#</text>')).toBeLessThan(svg.indexOf('>A</text>'))
    expect(svg).toContain(`stroke="${PALETTES.light.accent}"`)
  })

  it('leerer Stack als gestrichelte ε-Zelle; minCells hält die Höhe gleich', () => {
    const empty = stackFigureSvg([], { minCells: 3 })
    expect(empty.svg).toContain('stroke-dasharray')
    expect(empty.svg).toContain('>ε</text>')
    expect(empty.height).toBe(stackFigureSvg(['#', 'A', 'B']).height)
  })

  it('rowSvg addiert die Breiten und nimmt die größte Höhe', () => {
    const a = tableSvg({ columns: [{ title: 'A' }], rows: [['1']] })
    const b = stackFigureSvg(['#'], { minCells: 5 })
    const row = rowSvg([a, b], 16)
    expect(row.width).toBe(a.width + b.width + 16)
    expect(row.height).toBe(Math.max(a.height, b.height))
  })
})

describe('Export Turingmaschine', () => {
  const tm = buildDocument('TM', ['a'], { start: 'q0', finals: ['q1'], tape: ['X'] }, [
    ['q0', 'a → X, R', 'q0'],
    ['q0', '# → #, L', 'q1']
  ])

  it('Übergangstabelle als Matrix Zustand × Bandsymbol, Blank zuletzt', () => {
    const table = transitionTable(tm, false)
    expect(table.columns.map((c) => c.title)).toEqual(['Zustand', 'a', 'X', '#'])
    expect(table.rows).toEqual([
      ['→ q0', 'q0, X, R', '–', 'q1, #, L'],
      ['* q1', '–', '–', '–']
    ])
  })

  it('Alphabet mit Σ, Γ und Blank', () => {
    expect(alphabetTable(tm).rows).toEqual([
      ['1', 'Σ', 'a', '', '1'],
      ['2', 'Γ', 'a', '', '1'],
      ['3', 'Γ', 'X', '', '1'],
      ['4', 'Γ', '#', 'Blank', '1']
    ])
  })

  it('Simulationstabelle mit Regel und Band', () => {
    const sim = createAutomaton(tm).createSimulator('aa')
    const steps = [sim.reset(), ...sim.run().steps]
    const snapshot: SimulationSnapshot = { word: 'aa', steps, index: 0, outcome: 'accepted' }
    const table = simulationTable(tm, snapshot)
    expect(table.columns.map((c) => c.title)).toEqual(['#', 'Regel', 'Zustand', 'Band'])
    expect(table.rows).toEqual([
      ['0', '–', 'q0', '[a]a'],
      ['1', 'a → X, R', 'q0', 'X[a]'],
      ['2', 'a → X, R', 'q0', 'XX[#]'],
      ['3', '# → #, L', 'q1', 'X[X]']
    ])
  })

  it('Band mit Kopf, Zustand und festem Ausschnitt', () => {
    const image = tapeFigureSvg({ start: 0, symbols: ['X', 'a'] }, 1, {
      blank: '#',
      state: 'q0',
      from: -1,
      to: 3
    })
    expect(image.svg).toContain('>q0<')
    expect(image.svg.match(/<rect x=/g)).toHaveLength(5 + 1)
    const wider = tapeFigureSvg({ start: 0, symbols: ['X', 'a'] }, 1, { blank: '#', from: -3, to: 5 })
    expect(wider.width).toBeGreaterThan(image.width)
  })
})

describe('A4-Seiten', () => {
  it('pageSvg: Hoch- und Querformat, zu große Bilder verkleinert', () => {
    const small = tableSvg({ columns: [{ title: 'x' }], rows: [['1']] })
    expect(pageSvg(small, 'portrait')).toMatchObject(A4.portrait)
    expect(pageSvg(small, 'portrait').svg).toContain('scale(1)')
    const wide = { ...small, width: 2246 }
    expect(pageSvg(wide, 'landscape')).toMatchObject(A4.landscape)
    expect(pageSvg(wide, 'landscape').svg).toContain(`scale(${(1123 - 76) / 2246})`)
  })

  it('pdfHtml: Querseiten auf der benannten Seite „quer“', () => {
    const graph = graphSvg(evenAs)
    const html = pdfHtml([pageSvg(graph, 'landscape'), pageSvg(graph, 'portrait')])
    expect(html).toContain('@page quer{size:A4 landscape')
    expect(html.match(/class="page is-landscape"/g)).toHaveLength(1)
    expect(html.match(/class="page"/g)).toHaveLength(1)
  })

  it('paragraphSvg bricht lange Sätze um', () => {
    const text = 'Es wird „a“ gelesen, „A“ vom Stack genommen und in Zustand q1 gewechselt.'
    expect(paragraphSvg(text, 2000).svg.match(/<text/g)).toHaveLength(1)
    expect(paragraphSvg(text, 200).svg.match(/<text/g)?.length).toBeGreaterThan(1)
  })
})

describe('Ergebnis im Simulationsexport', () => {
  const tm = buildDocument('TM', ['a'], { start: 'q0', finals: [] }, [['q0', 'a → a, R', 'q0']])

  it('verworfener Lauf: „Verworfen“ unter der Tabelle und in der CSV', () => {
    const sim = new DFA(evenAs).createSimulator('ab')
    const steps = [sim.reset(), ...sim.run().steps]
    const table = simulationTable(evenAs, { word: 'ab', steps, index: 0, outcome: 'rejected' })
    expect(table.result).toEqual({ text: 'Verworfen', tone: 'rejected' })
    const { svg } = tableSvg(table)
    expect(svg).toContain(`fill="${PALETTES.light.danger}">Verworfen</text>`)
    expect(tableToCsv(table).endsWith('\r\n\r\nErgebnis;Verworfen\r\n')).toBe(true)
  })

  it('akzeptierter Lauf: „Akzeptiert“ in Grün', () => {
    const sim = new DFA(evenAs).createSimulator('aa')
    const steps = [sim.reset(), ...sim.run().steps]
    const table = simulationTable(evenAs, { word: 'aa', steps, index: 0, outcome: 'accepted' })
    expect(tableSvg(table).svg).toContain(`fill="${PALETTES.light.success}">Akzeptiert</text>`)
  })

  it('abgebrochener Lauf zeigt den Grund statt „Verworfen“', () => {
    const steps = [createAutomaton(tm).createSimulator('aa').reset()]
    const reason = 'Abbruch nach 10 Schritten'
    const table = simulationTable(tm, {
      word: 'aa',
      steps,
      index: 0,
      outcome: 'rejected',
      abortReason: reason
    })
    expect(table.result).toEqual({ text: reason, tone: 'rejected' })
    expect(tableSvg(table).svg).toContain(`>${reason}</text>`)
    expect(tableToCsv(table)).toContain(`\r\nErgebnis;${reason}\r\n`)
  })

  it('ohne Ergebnis keine Ergebniszeile; beim Aufteilen nur auf der letzten Seite', () => {
    const steps = [createAutomaton(tm).createSimulator('aa').reset()]
    expect(simulationTable(tm, { word: 'aa', steps, index: 0 }).result).toBeUndefined()
    const table = {
      columns: [{ title: 'x' }],
      rows: [['1'], ['2'], ['3']],
      result: { text: 'Verworfen', tone: 'rejected' as const }
    }
    expect(paginateTable(table, 2).map((p) => p.result?.text)).toEqual([undefined, 'Verworfen'])
  })
})

describe('CSV ohne Formeln', () => {
  it('Zellen mit =, +, -, @, Tab oder CR am Anfang bekommen ein Apostroph', () => {
    const csv = tableToCsv({
      columns: [{ title: '=Titel' }],
      rows: [['=1+1'], ['+A'], ['-2'], ['@SUM(A1)'], ['\tx'], ['\rx']]
    })
    const lines = ["'=Titel", "'=1+1", "'+A", "'-2", "'@SUM(A1)", "'\tx", `"'\rx"`]
    expect(csv).toBe(`﻿${lines.join('\r\n')}\r\n`)
  })

  it('normale Inhalte bleiben unverändert', () => {
    const rows = [['ε'], ['–'], ['→ q0'], ['q0']]
    const csv = tableToCsv({ columns: [{ title: 'Zustand' }], rows })
    expect(csv).toBe('﻿Zustand\r\nε\r\n–\r\n→ q0\r\nq0\r\n')
  })
})

describe('Bildgröße nach Textbreite', () => {
  it('Graph schließt lange Zustandsnamen ein', () => {
    const name = 'W'.repeat(60)
    const doc = buildDocument('DFA', [], { start: name, finals: [] }, [])
    expect(graphSvg(doc).width).toBeGreaterThanOrEqual(measureText(name, MONO, 14))
  })

  it('Tabelle ist mindestens so breit wie Titel und Untertitel', () => {
    const title = 'W'.repeat(60)
    const image = tableSvg({ title, columns: [{ title: '#' }], rows: [['1']] })
    expect(image.width).toBeGreaterThanOrEqual(measureText(title, SERIF, 20))
    const named = tableSvg({ title: 'T', subtitle: title, columns: [{ title: '#' }], rows: [] })
    expect(named.width).toBeGreaterThanOrEqual(measureText(title, SERIF, 13))
  })

  it('Beschriftung und Absatz werden für lange Texte breiter', () => {
    const text = 'W'.repeat(80)
    expect(captionSvg(text, 100).width).toBeGreaterThanOrEqual(measureText(text, SERIF, 18))
    expect(paragraphSvg(text, 100).width).toBeGreaterThanOrEqual(measureText(text, SERIF, 14))
  })

  it('Band schließt einen langen Zustandsnamen über dem Kopf ein', () => {
    const state = 'W'.repeat(40)
    const tape = { start: 0, symbols: ['a'] }
    const image = tapeFigureSvg(tape, 0, { blank: '#', state, from: 0, to: 0 })
    const label = image.svg.match(/<rect x="([-\d.]+)" y="[\d.]+" width="([\d.]+)" height="20"/)
    expect(Number(label?.[1])).toBeGreaterThanOrEqual(0)
    expect(Number(label?.[1]) + Number(label?.[2])).toBeLessThanOrEqual(image.width)
  })
})

describe('Export Transduktor', () => {
  const mealy = buildDocument('MEALY', ['a', 'b'], { start: 'q0', output: ['0', '1'] }, [
    ['q0', 'a/0, b/11', 'q1'],
    ['q1', 'a/ε', 'q0']
  ])
  const moore = buildDocument(
    'MOORE',
    ['a'],
    { start: 'q0', output: ['0', '1'], outputs: { q0: '0', q1: '1' } },
    [
      ['q0', 'a', 'q1'],
      ['q1', 'a', 'q0']
    ]
  )

  it('Graph zeigt Mealy-Regeln „a/0“ und Moore-Zustände „q0/0“', () => {
    expect(graphSvg(mealy).svg).toContain('a/0, b/11')
    expect(graphSvg(moore).svg).toContain('>q0/0<')
  })

  it('Alphabet mit Σ und Δ', () => {
    expect(alphabetTable(moore).rows).toEqual([
      ['1', 'Σ', 'a', '2'],
      ['2', 'Δ', '0', '1'],
      ['3', 'Δ', '1', '1']
    ])
  })

  it('Übergangstabelle: Mealy mit Ausgabe der Regel, Moore mit Ausgabe des Zustands', () => {
    const mealyTable = transitionTable(mealy, false)
    expect(mealyTable.columns.map((c) => c.title)).toEqual([
      '#',
      'Zustand',
      'Symbol',
      'Ausgabe',
      'Folgezustand'
    ])
    expect(mealyTable.rows).toEqual([
      ['1', 'q0', 'a', '0', 'q1'],
      ['2', 'q0', 'b', '11', 'q1'],
      ['3', 'q1', 'a', 'ε', 'q0']
    ])
    expect(transitionTable(moore, false).rows).toEqual([
      ['1', 'q0', '0', 'a', 'q1'],
      ['2', 'q1', '1', 'a', 'q0']
    ])
  })

  it('Simulationstabelle mit Ausgabe, Ergebnis ist die Ausgabe', () => {
    const sim = createAutomaton(mealy).createSimulator('ba')
    const steps = [sim.reset(), ...sim.run().steps]
    const snapshot: SimulationSnapshot = { word: 'ba', steps, index: 2, outcome: 'accepted' }
    const table = simulationTable(mealy, snapshot)
    expect(table.columns.map((c) => c.title)).toEqual([
      '#',
      'Regel',
      'Zustand',
      'Resteingabe',
      'Ausgabe'
    ])
    expect(table.rows).toEqual([
      ['0', '–', 'q0', 'ba', 'ε'],
      ['1', 'b/11', 'q1', 'a', '11'],
      ['2', 'a/ε', 'q0', 'ε', '11']
    ])
    expect(table.result).toEqual({ text: 'Ausgabe „11“', tone: 'accepted' })
  })

  it('Ausgabe-Bild: eine Spalte pro Eingabesymbol, Breite nach dem endgültigen Stück', () => {
    const columns = [
      { input: null, output: '0' },
      { input: 'a', output: '1' },
      { input: 'a', output: null }
    ]
    const image = outputFigureSvg(columns, { current: 1, word: '01' })
    expect(image.svg).toContain('>Start<')
    expect(image.svg.match(/<rect x=/g)).toHaveLength(2 * 3)
    const reserved = outputFigureSvg(
      columns.map((c) => ({ ...c, reserve: '0000000' })),
      { current: 1, word: '01' }
    )
    expect(reserved.width).toBeGreaterThan(image.width)
  })
})

describe('svgDataUrl', () => {
  const decoded = (svg: string): string => decodeURIComponent(svgDataUrl(svg).split(',')[1])

  it('ersetzt einzelne Surrogate, statt zu werfen, und behält ganze Emojis', () => {
    expect(decoded('<svg>\uDE00x\uD83D</svg>')).toBe('<svg>�x�</svg>')
    expect(decoded('<svg>😀</svg>')).toBe('<svg>😀</svg>')
  })
})

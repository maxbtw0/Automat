import {
  formatLabel,
  formatStack,
  formatStackWord,
  formatTape,
  formatWord
} from '@/core/automaton/labels'
import { getAutomatonDefinition } from '@/core/automaton/registry'
import type { SimulationStep } from '@/core/automaton/types'
import { tokenizeWord } from '@/core/automaton/word'
import {
  compareSymbols,
  findState,
  listTransitionEntries,
  outputSettings,
  outputsOnStates,
  sortTransitionEntries,
  stackSettings,
  stateOutput,
  tapeSettings,
  labelSymbols,
  usesOutput,
  usesStack,
  usesTape,
  type AlphabetKind,
  type AutomatonDocument
} from '@/model/graph'
import { turingCells } from '@/model/turingTable'
import { formatStateSet } from '@/utils/format'
import type { ExportTable, RowTone, TableResult } from './svg'

/** Ein Simulationslauf zum Exportieren */
export interface SimulationSnapshot {
  word: string
  steps: SimulationStep[]
  /** Hervorgehobener Schritt (bei „Graph mit Tabelle“) */
  index: number
  /** Ergebnis, falls der letzte Schritt das Ende der Simulation ist – fehlt bei Abbruch am Limit */
  outcome?: 'accepted' | 'rejected'
  /** Grund, falls die Simulation vorzeitig abgebrochen ist (Limit) */
  abortReason?: string | null
}

/**
 * Alphabet; beim Kellerautomaten und der Turingmaschine Σ und Γ untereinander mit Spalte
 * „Alphabet“, beim Transduktor Σ und Δ.
 */
export function alphabetTable(document: AutomatonDocument): ExportTable {
  const usage = (symbol: string, kind: AlphabetKind): number =>
    document.graph.transitions.filter((t) =>
      t.labels.some((l) => labelSymbols(l, kind).includes(symbol))
    ).length
  if (usesOutput(document.type)) {
    // Moore: Ausgaben hängen an Zuständen – gezählt werden dann Zustände
    const moore = outputsOnStates(document.type)
    const outputUsage = (symbol: string): number =>
      moore
        ? document.graph.states.filter((s) => stateOutput(s).includes(symbol)).length
        : usage(symbol, 'output')
    const rows = [
      ...document.alphabet.map((symbol) => ['Σ', symbol, String(usage(symbol, 'input'))]),
      ...outputSettings(document).alphabet.map((symbol) => [
        'Δ',
        symbol,
        String(outputUsage(symbol))
      ])
    ]
    return {
      title: 'Alphabet',
      columns: [
        { title: '#' },
        { title: 'Alphabet' },
        { title: 'Symbol', mono: true },
        { title: 'Benutzt', align: 'right' }
      ],
      rows: rows.map((row, i) => [String(i + 1), ...row])
    }
  }
  if (usesTape(document.type)) {
    const tape = tapeSettings(document)
    const rows = [
      ...document.alphabet.map((symbol) => ['Σ', symbol, '', String(usage(symbol, 'input'))]),
      ...tape.alphabet.map((symbol) => [
        'Γ',
        symbol,
        symbol === tape.blank ? 'Blank' : '',
        String(usage(symbol, 'tape'))
      ])
    ]
    return {
      title: 'Alphabet',
      columns: [
        { title: '#' },
        { title: 'Alphabet' },
        { title: 'Symbol', mono: true },
        { title: 'Band' },
        { title: 'Übergänge', align: 'right' }
      ],
      rows: rows.map((row, i) => [String(i + 1), ...row])
    }
  }
  if (!usesStack(document.type)) {
    return {
      title: 'Alphabet',
      columns: [
        { title: '#' },
        { title: 'Symbol', mono: true },
        { title: 'Übergänge', align: 'right' }
      ],
      rows: document.alphabet.map((symbol, i) => [
        String(i + 1),
        symbol,
        String(usage(symbol, 'input'))
      ])
    }
  }
  const stack = stackSettings(document)
  const rows = [
    ...document.alphabet.map((symbol) => ['Σ', symbol, '', String(usage(symbol, 'input'))]),
    ...stack.alphabet.map((symbol) => [
      'Γ',
      symbol,
      symbol === stack.start ? 'Start' : '',
      String(usage(symbol, 'stack'))
    ])
  ]
  return {
    // Der Untertitel ist für den Namen des Automaten reserviert
    title: `Alphabet · Akzeptanz mit ${stack.acceptance === 'empty' ? 'leerem Stack' : 'Endzustand'}`,
    columns: [
      { title: '#' },
      { title: 'Alphabet' },
      { title: 'Symbol', mono: true },
      { title: 'Stack' },
      { title: 'Übergänge', align: 'right' }
    ],
    rows: rows.map((row, i) => [String(i + 1), ...row])
  }
}

/**
 * Turingmaschine: Matrix Zustand × Bandsymbol (Blank zuletzt), Zelle „q1, X, R“, leer „–“.
 * Vor dem Zustand → für den Start- und * für Endzustände.
 */
function turingTable(document: AutomatonDocument, sorted: boolean): ExportTable {
  const { graph } = document
  const tape = tapeSettings(document)
  const symbols = [...tape.alphabet.filter((s) => s !== tape.blank), tape.blank]
  const labels = new Map(graph.states.map((s) => [s.id, s.label]))
  const label = (id: string): string => labels.get(id) ?? '?'
  const cells = turingCells(graph)
  const states = sorted
    ? [...graph.states].sort((a, b) => compareSymbols(a.label, b.label))
    : graph.states
  return {
    title: 'Übergangstabelle',
    columns: [
      { title: 'Zustand', mono: true },
      ...symbols.map((symbol) => ({ title: symbol, mono: true }))
    ],
    rows: states.map((state) => [
      `${state.isStart ? '→' : ''}${state.isFinal ? '*' : ''} ${state.label}`.trim(),
      ...symbols.map((symbol) => {
        const cell = cells.get(state.id)?.get(symbol) ?? null
        return cell ? `${label(cell.to)}, ${cell.write}, ${cell.move}` : '–'
      })
    ])
  }
}

export function transitionTable(document: AutomatonDocument, sorted: boolean): ExportTable {
  if (usesTape(document.type)) return turingTable(document, sorted)
  const { graph } = document
  const entries = listTransitionEntries(graph)
  const label = (id: string): string => findState(graph, id)?.label ?? '?'
  const rows = sorted ? sortTransitionEntries(graph, entries) : entries
  if (usesOutput(document.type)) {
    // Mealy: Ausgabe der Regel; Moore: Ausgabe des Zustands der Zeile
    const delta = outputSettings(document).alphabet
    const moore = outputsOnStates(document.type)
    const stateOutputOf = (id: string): string => {
      const state = findState(graph, id)
      return formatWord(state ? stateOutput(state) : [], delta)
    }
    return {
      title: 'Übergangstabelle',
      columns: [
        { title: '#' },
        { title: 'Zustand', mono: true },
        ...(moore ? [{ title: 'Ausgabe', mono: true }] : []),
        { title: 'Symbol', mono: true },
        ...(moore ? [] : [{ title: 'Ausgabe', mono: true }]),
        { title: 'Folgezustand', mono: true }
      ],
      rows: rows.map((e, i) => [
        String(i + 1),
        label(e.from),
        ...(moore ? [stateOutputOf(e.from)] : []),
        e.symbol ?? '–',
        ...(moore ? [] : [e.symbol === null ? '–' : formatWord(e.output ?? [], delta)]),
        label(e.to)
      ])
    }
  }
  if (usesStack(document.type)) {
    return {
      title: 'Übergangstabelle',
      columns: [
        { title: '#' },
        { title: 'Zustand', mono: true },
        { title: 'Eingabe', mono: true },
        { title: 'Top of Stack', mono: true },
        { title: 'Push', mono: true },
        { title: 'Folgezustand', mono: true }
      ],
      rows: rows.map((e, i) => [
        String(i + 1),
        label(e.from),
        e.symbol ?? '–',
        e.symbol === null ? '–' : (e.pop ?? 'ε'),
        e.symbol === null ? '–' : formatStackWord(e.push ?? [], stackSettings(document).alphabet),
        label(e.to)
      ])
    }
  }
  return {
    title: 'Übergangstabelle',
    columns: [
      { title: '#' },
      { title: 'Zustand', mono: true },
      { title: 'Symbol', mono: true },
      { title: 'Folgezustand', mono: true }
    ],
    rows: rows.map((e, i) => [String(i + 1), label(e.from), e.symbol ?? '–', label(e.to)])
  }
}

/**
 * Ergebnis unter der Tabelle: „Akzeptiert“, „Verworfen“ oder der Grund des Abbruchs – beim
 * Transduktor die Ausgabe.
 */
/**
 * Titel der Simulationstabelle. Das leere Eingabefeld heißt „leeres Wort ε“, Zeichen außerhalb
 * von Σ werden genannt – sonst sähen „“ und ein eingegebenes „ε“ gleich aus.
 */
function simulationTitle(document: AutomatonDocument, word: string): string {
  const text = word.trim()
  if (text === '') return 'Simulation des leeren Worts ε'
  const foreign = [...new Set(tokenizeWord(text, document.alphabet))].filter(
    (symbol) => !document.alphabet.includes(symbol)
  )
  const note = foreign.length > 0 ? ` · ${foreign.map((s) => `„${s}“`).join(', ')} nicht in Σ` : ''
  return `Simulation „${text}“${note}`
}

function simulationResult(
  document: AutomatonDocument,
  snapshot: SimulationSnapshot
): TableResult | undefined {
  if (snapshot.abortReason) {
    return { text: snapshot.abortReason, tone: snapshot.outcome ? 'rejected' : 'aborted' }
  }
  if (!snapshot.outcome) return undefined
  if (usesOutput(document.type) && snapshot.outcome === 'accepted') {
    const last = snapshot.steps[snapshot.steps.length - 1]
    const output = formatWord((last?.output ?? []).flat(), outputSettings(document).alphabet)
    return { text: `Ausgabe „${output}“`, tone: 'accepted' }
  }
  const text = snapshot.outcome === 'accepted' ? 'Akzeptiert' : 'Verworfen'
  return { text, tone: snapshot.outcome }
}

/** Konfigurationen der Simulation; `markCurrent` hebt den angezeigten Schritt hervor. */
export function simulationTable(
  document: AutomatonDocument,
  snapshot: SimulationSnapshot,
  { markCurrent = false } = {}
): ExportTable {
  const single = getAutomatonDefinition(document.type).singlePath
  const label = (id: string): string => findState(document.graph, id)?.label ?? '?'
  const last = snapshot.steps.length - 1
  const rowTones = snapshot.steps.map((_, i): RowTone | undefined => {
    if (i === last && snapshot.outcome) return snapshot.outcome
    return markCurrent && i === snapshot.index ? 'current' : undefined
  })
  const title = simulationTitle(document, snapshot.word)
  const result = simulationResult(document, snapshot)
  if (usesOutput(document.type)) {
    const delta = outputSettings(document).alphabet
    const mealy = !outputsOnStates(document.type)
    return {
      title,
      result,
      columns: [
        { title: '#' },
        { title: mealy ? 'Regel' : 'Gelesen', mono: true },
        { title: 'Zustand', mono: true },
        { title: 'Resteingabe', mono: true },
        { title: 'Ausgabe', mono: true }
      ],
      rows: snapshot.steps.map((step) => [
        String(step.index),
        mealy && step.label ? formatLabel(step.label, delta) : (step.symbol ?? '–'),
        formatStateSet(step.activeStateIds.map(label), true),
        step.remaining || 'ε',
        formatWord((step.output ?? []).flat(), delta)
      ]),
      rowTones
    }
  }
  if (usesTape(document.type)) {
    return {
      title,
      result,
      columns: [
        { title: '#' },
        { title: 'Regel', mono: true },
        { title: 'Zustand', mono: true },
        { title: 'Band', mono: true }
      ],
      rows: snapshot.steps.map((step) => [
        String(step.index),
        step.label ? formatLabel(step.label) : '–',
        formatStateSet(step.activeStateIds.map(label), true),
        step.tape ? formatTape(step.tape, step.head ?? 0) : ''
      ]),
      rowTones
    }
  }
  if (usesStack(document.type)) {
    const gamma = stackSettings(document).alphabet
    return {
      title,
      result,
      columns: [
        { title: '#' },
        { title: 'Regel', mono: true },
        { title: 'Zustand', mono: true },
        { title: 'Resteingabe', mono: true },
        { title: 'Stack', mono: true }
      ],
      rows: snapshot.steps.map((step) => [
        String(step.index),
        step.label ? formatLabel(step.label, gamma) : '–',
        formatStateSet(step.activeStateIds.map(label), true),
        step.remaining || 'ε',
        formatStack(step.stack ?? [], gamma)
      ]),
      rowTones
    }
  }
  return {
    title,
    result,
    columns: [
      { title: '#' },
      { title: 'Gelesen', mono: true },
      { title: 'Zustand', mono: true },
      { title: 'Resteingabe', mono: true }
    ],
    rows: snapshot.steps.map((step) => [
      String(step.index),
      step.symbol ?? '–',
      formatStateSet(step.activeStateIds.map(label), single),
      step.remaining || 'ε'
    ]),
    rowTones
  }
}

/** Teilt eine lange Tabelle auf mehrere Seiten auf (Titel auf der ersten, Ergebnis auf der letzten). */
export function paginateTable(table: ExportTable, rowsPerPage: number): ExportTable[] {
  if (table.rows.length <= rowsPerPage) return [table]
  const pages: ExportTable[] = []
  for (let start = 0; start < table.rows.length; start += rowsPerPage) {
    pages.push({
      ...table,
      title: start === 0 ? table.title : undefined,
      result: start + rowsPerPage >= table.rows.length ? table.result : undefined,
      rows: table.rows.slice(start, start + rowsPerPage),
      rowTones: table.rowTones?.slice(start, start + rowsPerPage)
    })
  }
  return pages
}

/**
 * CSV mit Semikolon (öffnet sich in deutschem Excel direkt in Spalten) und UTF-8-BOM.
 * Das Ergebnis der Simulation folgt nach einer Leerzeile als „Ergebnis;…“.
 */
export function tableToCsv(table: ExportTable): string {
  const cell = (raw: string): string => {
    // Tabellenprogramme würden =, +, -, @, Tab oder CR am Anfang als Formel auswerten
    const text = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw
    return /[;"\r\n]/.test(text) || text !== text.trim() ? `"${text.replace(/"/g, '""')}"` : text
  }
  const rows = [table.columns.map((c) => c.title), ...table.rows]
  if (table.result) rows.push([], ['Ergebnis', table.result.text])
  const lines = rows.map((row) => row.map(cell).join(';'))
  return `﻿${lines.join('\r\n')}\r\n`
}
